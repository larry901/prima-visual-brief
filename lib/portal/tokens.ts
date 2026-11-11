import { createHash, randomBytes } from 'crypto'

export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export const MAGIC_LINK_MINUTES = 20
export const SESSION_DAYS = 14

export function magicLinkExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + MAGIC_LINK_MINUTES * 60 * 1000).toISOString()
}

export function sessionExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
}
