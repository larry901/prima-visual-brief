import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto'
import { demoSeedEnabled } from '../portal/seed'
import { normalizeEmail } from '../portal/email'
import { sendHubLinkEmail } from './mail'
import { hashToken, magicLinkExpiry, newToken } from '../portal/tokens'
import type { HubStore, StaffCodeRow } from './types'

const HOUR_MS = 60 * 60 * 1000
const MAX_LINKS_PER_HOUR = 5
export const HUB_SESSION_DAYS = 30

/** Six digits. Short enough to type on a phone, and what iOS offers to autofill. */
export const STAFF_CODE_DIGITS = 6
/** Wrong guesses that retire one code. A later email still has its own code. */
export const STAFF_CODE_MAX_ATTEMPTS = 5
/** Wrong guesses for one address in the window below, across every outstanding code. */
export const STAFF_CODE_EMAIL_MAX_ATTEMPTS = 10
/** Shorter than the 20-minute code so a fresh code still works after this lockout ends. */
export const STAFF_CODE_ATTEMPT_WINDOW_MS = 10 * 60 * 1000

export const STAFF_CODE_INVALID = 'That code is wrong, expired, or already used. Request a new sign-in email.'
export const STAFF_CODE_LIMITED = 'Too many attempts. Wait a few minutes, then request a new sign-in email.'
export const STAFF_CODE_BAD_INPUT = 'Enter your staff email and the 6-digit code from the sign-in email.'

const DUMMY_CODE_SALT = 'hub-sign-in-dummy-salt'
const DUMMY_CODE_HASH = createHmac('sha256', DUMMY_CODE_SALT).update('nobody@example.com:000000').digest('hex')

export function staffAllowlist(): Set<string> {
  const raw = process.env.STAFF_EMAILS ?? ''
  const emails = raw
    .split(/[,;\s]+/)
    .map((entry) => normalizeEmail(entry))
    .filter((entry) => isEmailAddress(entry))
  return new Set(emails)
}

export function isStaffEmail(email: string): boolean {
  return staffAllowlist().has(normalizeEmail(email))
}

function isEmailAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function hubSessionExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + HUB_SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export function newStaffCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(STAFF_CODE_DIGITS, '0')
}

/** Spaces and dashes are ignored so a code copied from the email still matches. */
export function normalizeStaffCode(input: string): string | null {
  const compact = input.trim().replace(/[\s-]/g, '')
  if (!new RegExp(`^\\d{${STAFF_CODE_DIGITS}}$`).test(compact)) return null
  return compact
}

/**
 * HMAC-SHA256 of the address and the code, keyed by a per-code salt.
 * The raw code is never stored. The address is part of the MAC so one row
 * cannot be replayed against a different inbox. Online guessing is capped
 * separately; a 6-digit code is not a secret against someone who has the salt.
 */
export function hashStaffCode(email: string, code: string, salt: string): string {
  return createHmac('sha256', salt).update(`${normalizeEmail(email)}:${code}`).digest('hex')
}

function staffCodeMatches(email: string, code: string, salt: string, expected: string): boolean {
  const actual = hashStaffCode(email, code, salt)
  const left = Buffer.from(actual, 'utf8')
  const right = Buffer.from(expected, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/**
 * Magic link and a 6-digit code for an address on STAFF_EMAILS.
 * Unknown addresses get the same success response, so the allowlist is not listed.
 * The message is only sent to staff. Demo inboxes on example.com can show the link
 * and the code when PORTAL_DEMO_SEED=true. Never put a real address in that mode.
 *
 * The link signs in the browser that opens it. iOS keeps a home-screen web app's
 * cookies separate from Safari, so Mail opening the link does not sign in the
 * installed Hub. The code is entered on the Hub sign-in screen, inside that app.
 * Using one does not use up the other.
 */
export async function requestStaffLink(
  store: HubStore,
  emailInput: string,
  origin: string,
  now: Date = new Date(),
): Promise<{ ok: true; demoUrl?: string; demoCode?: string } | { ok: false; status: number; error: string }> {
  const email = normalizeEmail(emailInput)
  if (!isEmailAddress(email)) {
    return { ok: false, status: 400, error: 'Enter a staff email address.' }
  }
  if (!isStaffEmail(email)) return { ok: true }
  const since = new Date(now.getTime() - HOUR_MS).toISOString()
  const recent = await store.countRecentStaffLinks(email, since)
  if (recent >= MAX_LINKS_PER_HOUR) return { ok: true }
  const token = newToken()
  const code = newStaffCode()
  const salt = randomBytes(16).toString('base64url')
  await store.createStaffMagicLink(email, hashToken(token), magicLinkExpiry(now), {
    hash: hashStaffCode(email, code, salt),
    salt,
  }, now)
  const url = `${origin.replace(/\/$/, '')}/hub/verify?token=${encodeURIComponent(token)}`
  if (demoSeedEnabled() && email.endsWith('@example.com')) {
    return { ok: true, demoUrl: url, demoCode: code }
  }
  try {
    await sendHubLinkEmail(email, url, code)
  } catch (error) {
    console.error('Hub magic link email failed')
    return { ok: false, status: 502, error: 'We could not send the sign-in email. Try again in a minute.' }
  }
  return { ok: true }
}

/**
 * Exchange a code for the staff address it was issued to.
 * Failures look the same for an unknown address, a wrong code, an expired code,
 * and a used code. Too many tries on one address pauses further tries.
 */
export async function redeemStaffCode(
  store: HubStore,
  emailInput: string,
  codeInput: string,
  now: Date = new Date(),
): Promise<{ ok: true; email: string } | { ok: false; status: number; error: string }> {
  const email = normalizeEmail(emailInput)
  const code = normalizeStaffCode(codeInput)
  if (!isEmailAddress(email) || !code) {
    return { ok: false, status: 400, error: STAFF_CODE_BAD_INPUT }
  }

  const nowIso = now.toISOString()
  const since = new Date(now.getTime() - STAFF_CODE_ATTEMPT_WINDOW_MS).toISOString()
  const recent = await store.countRecentCodeAttempts(email, since)
  if (recent >= STAFF_CODE_EMAIL_MAX_ATTEMPTS) {
    return { ok: false, status: 429, error: STAFF_CODE_LIMITED }
  }

  const candidates = await store.listActiveStaffCodes(email, nowIso, STAFF_CODE_MAX_ATTEMPTS)
  const matched = matchingCode(email, code, candidates)
  if (!candidates.length) staffCodeMatches(email, code, DUMMY_CODE_SALT, DUMMY_CODE_HASH)

  if (matched && isStaffEmail(email)) {
    const consumed = await store.consumeStaffCode(matched.id, nowIso, STAFF_CODE_MAX_ATTEMPTS)
    if (consumed) {
      await store.clearCodeAttempts(email)
      return { ok: true, email: consumed }
    }
  }

  if (candidates[0]) await store.incrementStaffCodeAttempts(candidates[0].id, STAFF_CODE_MAX_ATTEMPTS)
  await store.recordCodeAttempt(email, nowIso, since)
  return { ok: false, status: 401, error: STAFF_CODE_INVALID }
}

function matchingCode(email: string, code: string, candidates: StaffCodeRow[]): StaffCodeRow | null {
  for (const candidate of candidates) {
    if (staffCodeMatches(email, code, candidate.codeSalt, candidate.codeHash)) return candidate
  }
  return null
}

export async function issueHubSession(store: HubStore, email: string, now: Date = new Date()): Promise<string> {
  const token = newToken()
  await store.createStaffSession(email, hashToken(token), hubSessionExpiry(now))
  return token
}
