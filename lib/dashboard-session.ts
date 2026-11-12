// Staff dashboard session token.
// Value: base64url({"iat","exp"}) + "." + base64url(HMAC-SHA256).
// HMAC key: SHA-256("prima-dashboard-session:" + DASHBOARD_PASSWORD).
// Rotating the password rotates the key, so previously issued cookies stop verifying.
// Web Crypto only, so this module can run in Node and in Edge middleware.

export const SESSION_COOKIE = 'prima_session'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

const KEY_LABEL = 'prima-dashboard-session:'
const CLOCK_SKEW_SECONDS = 60
const MAX_TOKEN_LENGTH = 512

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  }
}

function configuredPassword(): string | null {
  const password = process.env.DASHBOARD_PASSWORD
  if (typeof password !== 'string' || password.length === 0) return null
  return password
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const length = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return diff === 0
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string): Uint8Array | null {
  if (value.length === 0 || value.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(value)) return null
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  try {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
}

async function importHmacKey(password: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest('SHA-256', encoder.encode(KEY_LABEL + password))
  return crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

async function signPayload(password: string, payloadPart: string): Promise<Uint8Array> {
  const key = await importHmacKey(password)
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payloadPart)))
}

function readPayload(value: unknown): { iat: number; exp: number } | null {
  if (!value || typeof value !== 'object') return null
  const record = value as { iat?: unknown; exp?: unknown }
  const { iat, exp } = record
  if (typeof iat !== 'number' || typeof exp !== 'number') return null
  if (!Number.isSafeInteger(iat) || !Number.isSafeInteger(exp)) return null
  if (exp - iat !== SESSION_MAX_AGE_SECONDS) return null
  return { iat, exp }
}

export async function dashboardPasswordMatches(provided: unknown): Promise<boolean> {
  const expected = configuredPassword()
  if (typeof provided !== 'string') return false
  const [left, right] = await Promise.all([
    sha256(provided),
    sha256(expected ?? 'prima-dashboard-password-unset'),
  ])
  const matches = timingSafeEqual(left, right)
  return expected !== null && matches
}

export async function createSessionToken(nowMs: number = Date.now()): Promise<string> {
  const password = configuredPassword()
  if (!password) throw new Error('DASHBOARD_PASSWORD is not set')
  if (!Number.isFinite(nowMs)) throw new Error('Invalid session time')
  const iat = Math.floor(nowMs / 1000)
  const payload = base64UrlEncode(encoder.encode(JSON.stringify({ iat, exp: iat + SESSION_MAX_AGE_SECONDS })))
  const mac = await signPayload(password, payload)
  return `${payload}.${base64UrlEncode(mac)}`
}

export async function verifySessionToken(
  token: string | undefined | null,
  nowMs: number = Date.now(),
): Promise<boolean> {
  try {
    if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return false
    const password = configuredPassword()
    if (!password || !Number.isFinite(nowMs)) return false
    const dot = token.indexOf('.')
    if (dot <= 0 || dot !== token.lastIndexOf('.')) return false
    const payloadPart = token.slice(0, dot)
    const signaturePart = token.slice(dot + 1)
    const expected = await signPayload(password, payloadPart)
    const provided = base64UrlDecode(signaturePart) ?? new Uint8Array()
    if (!timingSafeEqual(expected, provided)) return false

    const payloadBytes = base64UrlDecode(payloadPart)
    if (!payloadBytes) return false
    const payload = readPayload(JSON.parse(decoder.decode(payloadBytes)) as unknown)
    if (!payload) return false
    const now = Math.floor(nowMs / 1000)
    if (payload.iat > now + CLOCK_SKEW_SECONDS) return false
    if (now >= payload.exp) return false
    return true
  } catch {
    return false
  }
}
