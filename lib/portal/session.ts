import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { hashToken } from './tokens'
import type { ClientRecord, PortalStore } from './types'

export const PORTAL_COOKIE = 'prima_portal'

export async function readPortalClient(store: PortalStore, now: Date = new Date()): Promise<ClientRecord | null> {
  const token = cookies().get(PORTAL_COOKIE)?.value
  if (!token) return null
  return store.getClientBySession(hashToken(token), now.toISOString())
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  }
}

export function setPortalCookie(response: NextResponse, token: string): void {
  response.cookies.set(PORTAL_COOKIE, token, sessionCookieOptions())
}

export function clearPortalCookie(response: NextResponse): void {
  response.cookies.set(PORTAL_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 })
}
