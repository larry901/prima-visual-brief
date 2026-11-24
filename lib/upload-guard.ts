import { createHmac, timingSafeEqual } from 'crypto'
import { isScriptPhotoUploadPath, parseBlobScriptPhotoUrl } from './script-photos'

/** httpOnly cookie minted when the brief form asks to add a photo. */
export const UPLOAD_GRANT_COOKIE = 'pv_brief_upload'
export const UPLOAD_GRANT_TTL_MS = 2 * 60 * 60 * 1000

export const UPLOAD_GUARD_LIMITS = {
  tokensPerWindow: 80,
  grantsPerWindow: 40,
  windowMs: 10 * 60 * 1000,
}

type Bucket = number[]
const buckets = new Map<string, Bucket>()

export function resetUploadGuards(): void {
  buckets.clear()
}

export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { ok: true } | { ok: false; retryAfterSec: number } {
  const cutoff = now - windowMs
  const stamps = (buckets.get(key) ?? []).filter((stamp) => stamp > cutoff)
  if (stamps.length >= limit) {
    buckets.set(key, stamps)
    const retryAfterSec = Math.max(1, Math.ceil((stamps[0] + windowMs - now) / 1000))
    return { ok: false, retryAfterSec }
  }
  stamps.push(now)
  buckets.set(key, stamps)
  return { ok: true }
}

export function clientIpFromHeaders(headers: { get(name: string): string | null }): string {
  const real = headers.get('x-real-ip')?.trim()
  if (real) return real.slice(0, 80)
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first.slice(0, 80)
  }
  return 'unknown'
}

export function isSameOrigin(host: string | null, origin: string | null, secFetchSite: string | null): boolean {
  if (!host) return false
  if (origin && origin !== 'null') {
    try {
      return new URL(origin).host === host
    } catch {
      return false
    }
  }
  return secFetchSite === 'same-origin'
}

export function signUploadGrant(secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ exp: now + UPLOAD_GRANT_TTL_MS })).toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function uploadGrantValid(secret: string, token: string | null | undefined, now = Date.now()): boolean {
  if (!secret || !token) return false
  const dot = token.indexOf('.')
  if (dot <= 0) return false
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  const left = Buffer.from(sig)
  const right = Buffer.from(expected)
  if (left.length === 0 || left.length !== right.length) return false
  if (!timingSafeEqual(left, right)) return false
  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown }
    return typeof body.exp === 'number' && Number.isFinite(body.exp) && body.exp > now
  } catch {
    return false
  }
}

export type UploadDecision = { ok: true } | { ok: false; status: number; error: string }

export function authorizeBriefUpload(input: {
  purpose: 'grant' | 'token' | 'delete'
  host: string | null
  origin: string | null
  secFetchSite: string | null
  cookie: string | null
  secret: string
  /** Upload pathname, or the Blob URL when deleting. */
  target?: string | null
  ip: string
  now?: number
}): UploadDecision {
  const now = input.now ?? Date.now()
  if (!input.secret) {
    return { ok: false, status: 503, error: 'Photo upload is not configured.' }
  }
  if (!isSameOrigin(input.host, input.origin, input.secFetchSite)) {
    return { ok: false, status: 403, error: 'Add photos from the brief form.' }
  }
  if (input.purpose !== 'grant' && !uploadGrantValid(input.secret, input.cookie, now)) {
    return { ok: false, status: 403, error: 'Refresh the page, then add the photo again.' }
  }
  if (input.purpose === 'token' && !isScriptPhotoUploadPath(input.target ?? '')) {
    return { ok: false, status: 400, error: 'That photo could not be uploaded.' }
  }
  if (input.purpose === 'delete' && !parseBlobScriptPhotoUrl(input.target ?? '')) {
    return { ok: false, status: 400, error: 'That photo could not be removed.' }
  }
  const limit = input.purpose === 'grant' ? UPLOAD_GUARD_LIMITS.grantsPerWindow : UPLOAD_GUARD_LIMITS.tokensPerWindow
  const bucket = input.purpose === 'grant' ? `grant:${input.ip}` : `upload:${input.ip}`
  const rate = consumeRateLimit(bucket, limit, UPLOAD_GUARD_LIMITS.windowMs, now)
  if (!rate.ok) {
    const minutes = Math.max(1, Math.ceil(rate.retryAfterSec / 60))
    return {
      ok: false,
      status: 429,
      error: `Too many photos were uploaded just now. Wait ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`,
    }
  }
  return { ok: true }
}
