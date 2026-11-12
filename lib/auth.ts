import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  sessionCookieOptions,
  verifySessionToken,
} from './dashboard-session'

export {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  dashboardPasswordMatches,
  sessionCookieOptions,
  verifySessionToken,
} from './dashboard-session'

export async function isAuthenticated(): Promise<boolean> {
  const token = cookies().get(SESSION_COOKIE)?.value
  if (!token) return false
  return verifySessionToken(token)
}

export async function setAuthCookie(response: NextResponse): Promise<void> {
  response.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions(SESSION_MAX_AGE_SECONDS))
}

export function clearAuthCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0))
}
