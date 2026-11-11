import { demoSeedEnabled } from './seed'
import { hashToken, magicLinkExpiry, newToken } from './tokens'
import type { PortalStore } from './types'
import { sendMagicLinkEmail } from './mail'
import { normalizeEmail } from './ingest'

const HOUR_MS = 60 * 60 * 1000
const MAX_LINKS_PER_HOUR = 5

export async function requestPortalLink(
  store: PortalStore,
  emailInput: string,
  origin: string,
  now: Date = new Date(),
): Promise<{ ok: true; demoUrl?: string } | { ok: false; status: number; error: string }> {
  const email = normalizeEmail(emailInput)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, status: 400, error: 'Enter the email on your Prima Visual account.' }
  }
  const client = await store.findClientByEmail(email)
  if (!client?.active) return { ok: true }

  const since = new Date(now.getTime() - HOUR_MS).toISOString()
  const recent = await store.countRecentMagicLinks(client.id, since)
  if (recent >= MAX_LINKS_PER_HOUR) return { ok: true }

  const token = newToken()
  await store.createMagicLink(client.id, hashToken(token), magicLinkExpiry(now))
  const url = `${origin.replace(/\/$/, '')}/portal/verify?token=${encodeURIComponent(token)}`
  if (demoSeedEnabled() && email.endsWith('@example.com')) {
    return { ok: true, demoUrl: url }
  }
  try {
    await sendMagicLinkEmail(email, client.name, url)
  } catch (error) {
    console.error('Magic link email failed:', error)
    return { ok: false, status: 502, error: 'We could not send the sign-in email. Try again in a minute.' }
  }
  return { ok: true }
}
