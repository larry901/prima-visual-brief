import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto'
import { clientEmailAddresses } from './clients'
import { normalizeEmail } from './ingest'
import { hashToken, issuePortalSession, newToken } from './tokens'
import type { ClientRecord, PersonalLinkRow, PortalStore } from './types'

/**
 * Stable per-client portal link.
 * The URL token is 32 random bytes. It is not derived from the client id or email.
 * The database stores SHA-256(token) for lookup and an AES-256-GCM ciphertext of the
 * token, keyed from DASHBOARD_PASSWORD, so staff can copy the link and a leaked row
 * is not itself a usable URL. Signing in still requires an email on that client.
 */

export const PERSONAL_LINK_MISMATCH = "That email doesn't match this link."
export const PERSONAL_LINK_UNAVAILABLE = "This link isn't available."
export const PERSONAL_LINK_THROTTLED = 'Too many attempts. Try again later.'

/** Wrong emails on one link. Stops guessing the roster address. */
export const PERSONAL_LINK_SHORT_WINDOW_MS = 15 * 60 * 1000
export const PERSONAL_LINK_SHORT_MAX = 5
export const PERSONAL_LINK_DAY_WINDOW_MS = 24 * 60 * 60 * 1000
export const PERSONAL_LINK_DAY_MAX = 20

const TOKEN_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_LABEL = 'prima-portal-link:'

export function personalLinkSecret(override?: string): string {
  const secret = override ?? process.env.DASHBOARD_PASSWORD
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('DASHBOARD_PASSWORD is not set')
  }
  return secret
}

export function isPersonalToken(token: string): boolean {
  return token.length === 43 && /^[A-Za-z0-9_-]+$/.test(token) && Buffer.from(token, 'base64url').length === TOKEN_BYTES
}

export function personalLinkPath(token: string): string {
  return `/portal/c/${encodeURIComponent(token)}`
}

export function personalLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}${personalLinkPath(token)}`
}

function linkKey(secret: string): Buffer {
  return createHash('sha256').update(`${KEY_LABEL}${secret}`).digest()
}

export function sealPersonalToken(token: string, secret: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', linkKey(secret), iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

export function openPersonalToken(sealed: string, secret: string): string | null {
  try {
    const buf = Buffer.from(sealed, 'base64url')
    if (buf.length < IV_BYTES + TAG_BYTES + 1) return null
    const iv = buf.subarray(0, IV_BYTES)
    const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
    const encrypted = buf.subarray(IV_BYTES + TAG_BYTES)
    const decipher = createDecipheriv('aes-256-gcm', linkKey(secret), iv)
    decipher.setAuthTag(tag)
    const token = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    if (!isPersonalToken(token)) return null
    return token
  } catch {
    return null
  }
}

function readableToken(row: PersonalLinkRow, secret: string): string | null {
  const token = openPersonalToken(row.tokenCipher, secret)
  if (!token || hashToken(token) !== row.tokenHash) return null
  return token
}

/** Case-insensitive, trimmed. Checks the primary and every additional email. */
export function emailMatchesClient(
  client: { email: string; additionalEmails?: string[] | null },
  emailInput: string,
): boolean {
  const email = normalizeEmail(emailInput)
  const digest = createHash('sha256').update(email).digest()
  let matched = 0
  for (const candidate of clientEmailAddresses(client)) {
    const other = createHash('sha256').update(candidate).digest()
    matched |= timingSafeEqual(digest, other) ? 1 : 0
  }
  return matched === 1
}

async function clientForPersonalToken(store: PortalStore, tokenInput: string): Promise<ClientRecord | null> {
  const token = tokenInput.trim()
  if (!isPersonalToken(token)) return null
  return store.findClientByPersonalLink(hashToken(token))
}

export async function personalLinkStatus(
  store: PortalStore,
  tokenInput: string,
): Promise<'ready' | 'unavailable'> {
  const client = await clientForPersonalToken(store, tokenInput)
  if (!client?.active) return 'unavailable'
  return 'ready'
}

export type RedeemResult =
  | { ok: true; sessionToken: string; client: ClientRecord }
  | { ok: false; status: number; code: 'invalid' | 'inactive' | 'mismatch' | 'throttled'; error: string }

export async function redeemPersonalLink(
  store: PortalStore,
  tokenInput: string,
  emailInput: string,
  now: Date = new Date(),
): Promise<RedeemResult> {
  const token = tokenInput.trim()
  const client = await clientForPersonalToken(store, token)
  if (!client) return { ok: false, status: 400, code: 'invalid', error: PERSONAL_LINK_UNAVAILABLE }
  if (!client.active) return { ok: false, status: 400, code: 'inactive', error: PERSONAL_LINK_UNAVAILABLE }

  const tokenHash = hashToken(token)
  const [recent, daily] = await Promise.all([
    store.countPersonalLinkAttempts(tokenHash, new Date(now.getTime() - PERSONAL_LINK_SHORT_WINDOW_MS).toISOString()),
    store.countPersonalLinkAttempts(tokenHash, new Date(now.getTime() - PERSONAL_LINK_DAY_WINDOW_MS).toISOString()),
  ])
  if (recent >= PERSONAL_LINK_SHORT_MAX || daily >= PERSONAL_LINK_DAY_MAX) {
    return { ok: false, status: 429, code: 'throttled', error: PERSONAL_LINK_THROTTLED }
  }

  const submitted = emailInput.length > 320 ? '' : emailInput
  if (!emailMatchesClient(client, submitted)) {
    await store.recordPersonalLinkAttempt(tokenHash, now.toISOString())
    return { ok: false, status: 400, code: 'mismatch', error: PERSONAL_LINK_MISMATCH }
  }

  await store.clearPersonalLinkAttempts(tokenHash)
  const sessionToken = await issuePortalSession(store, client.id, now)
  return { ok: true, sessionToken, client }
}

export async function ensurePersonalLink(store: PortalStore, clientId: number, secret?: string): Promise<string> {
  const key = personalLinkSecret(secret)
  const client = await store.getClient(clientId)
  if (!client) throw new Error('Client not found')
  const existing = await store.getPersonalLink(clientId)
  if (existing) {
    const token = readableToken(existing, key)
    if (!token) throw new Error('Personal link cannot be shown')
    return token
  }
  const token = newToken()
  const inserted = await store.insertPersonalLink(clientId, hashToken(token), sealPersonalToken(token, key))
  if (inserted) return token
  const winner = await store.getPersonalLink(clientId)
  const opened = winner ? readableToken(winner, key) : null
  if (!opened) throw new Error('Personal link cannot be shown')
  return opened
}

export async function resetPersonalLink(store: PortalStore, clientId: number, secret?: string): Promise<string> {
  const key = personalLinkSecret(secret)
  const client = await store.getClient(clientId)
  if (!client) throw new Error('Client not found')
  const existing = await store.getPersonalLink(clientId)
  const token = newToken()
  await store.replacePersonalLink(clientId, hashToken(token), sealPersonalToken(token, key))
  if (existing) await store.clearPersonalLinkAttempts(existing.tokenHash)
  return token
}

export async function personalLinksForClients(
  store: PortalStore,
  clientIds: number[],
  secret?: string,
): Promise<Map<number, string | null>> {
  const key = personalLinkSecret(secret)
  const rows = await store.listPersonalLinks()
  const byId = new Map(rows.map((row) => [row.clientId, row]))
  const result = new Map<number, string | null>()
  const missing: number[] = []
  for (const clientId of clientIds) {
    const existing = byId.get(clientId)
    if (!existing) {
      missing.push(clientId)
      continue
    }
    result.set(clientId, readableToken(existing, key))
  }
  await Promise.all(
    missing.map(async (clientId) => {
      try {
        result.set(clientId, await ensurePersonalLink(store, clientId, key))
      } catch {
        console.error('Could not create personal link')
        result.set(clientId, null)
      }
    }),
  )
  return result
}
