import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { isAuthenticated } from '../auth'
import { hashToken } from '../portal/tokens'
import { getHubStore } from './store'

export const HUB_COOKIE = 'prima_hub'

export interface HubStaff {
  email: string | null
  via: 'magic' | 'dashboard'
}

export function hubCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  }
}

export function setHubCookie(response: NextResponse, token: string): void {
  response.cookies.set(HUB_COOKIE, token, hubCookieOptions(60 * 60 * 24 * 30))
}

export function clearHubCookie(response: NextResponse): void {
  response.cookies.set(HUB_COOKIE, '', hubCookieOptions(0))
}

/**
 * Staff only. A hub magic-link session, or the existing dashboard password session.
 * A client portal cookie is not accepted.
 */
export async function readHubStaff(now: Date = new Date()): Promise<HubStaff | null> {
  const token = cookies().get(HUB_COOKIE)?.value
  if (token) {
    try {
      const email = await getHubStore().getStaffBySession(hashToken(token), now.toISOString())
      if (email) return { email, via: 'magic' }
    } catch (error) {
      console.error('Hub session could not be read', error instanceof Error ? error.message : 'error')
    }
  }
  if (await isAuthenticated()) return { email: null, via: 'dashboard' }
  return null
}

/** Stop the page before it reads the database when nobody is signed in. */
export async function requireHubPage(): Promise<HubStaff> {
  const staff = await readHubStaff()
  if (!staff) redirect('/hub/login')
  return staff
}
