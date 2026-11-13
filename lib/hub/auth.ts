import { demoSeedEnabled } from '../portal/seed'
import { normalizeEmail } from '../portal/email'
import { sendHubLinkEmail } from './mail'
import { hashToken, magicLinkExpiry, newToken } from '../portal/tokens'
import type { HubStore } from './types'

const HOUR_MS = 60 * 60 * 1000
const MAX_LINKS_PER_HOUR = 5
export const HUB_SESSION_DAYS = 30

export function staffAllowlist(): Set<string> {
  const raw = process.env.STAFF_EMAILS ?? ''
  const emails = raw
    .split(/[,;\s]+/)
    .map((entry) => normalizeEmail(entry))
    .filter((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry))
  return new Set(emails)
}

export function isStaffEmail(email: string): boolean {
  return staffAllowlist().has(normalizeEmail(email))
}

export function hubSessionExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + HUB_SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Magic link for an address on STAFF_EMAILS.
 * Unknown addresses get the same success response, so the allowlist is not listed.
 * The message is only sent to staff. Demo inboxes on example.com can show the link
 * when PORTAL_DEMO_SEED=true. Never put a real address in that mode's on-screen link.
 */
export async function requestStaffLink(
  store: HubStore,
  emailInput: string,
  origin: string,
  now: Date = new Date(),
): Promise<{ ok: true; demoUrl?: string } | { ok: false; status: number; error: string }> {
  const email = normalizeEmail(emailInput)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, status: 400, error: 'Enter a staff email address.' }
  }
  if (!isStaffEmail(email)) return { ok: true }
  const since = new Date(now.getTime() - HOUR_MS).toISOString()
  const recent = await store.countRecentStaffLinks(email, since)
  if (recent >= MAX_LINKS_PER_HOUR) return { ok: true }
  const token = newToken()
  await store.createStaffMagicLink(email, hashToken(token), magicLinkExpiry(now), now)
  const url = `${origin.replace(/\/$/, '')}/hub/verify?token=${encodeURIComponent(token)}`
  if (demoSeedEnabled() && email.endsWith('@example.com')) {
    return { ok: true, demoUrl: url }
  }
  try {
    await sendHubLinkEmail(email, url)
  } catch (error) {
    console.error('Hub magic link email failed')
    return { ok: false, status: 502, error: 'We could not send the sign-in email. Try again in a minute.' }
  }
  return { ok: true }
}

export async function issueHubSession(store: HubStore, email: string, now: Date = new Date()): Promise<string> {
  const token = newToken()
  await store.createStaffSession(email, hashToken(token), hubSessionExpiry(now))
  return token
}
