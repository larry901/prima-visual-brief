import { NextResponse } from 'next/server'
import { clearPortalCookie } from '@/lib/portal/session'
import { hashToken } from '@/lib/portal/tokens'
import { getPortalStore } from '@/lib/portal/store'
import { cookies } from 'next/headers'
import { PORTAL_COOKIE } from '@/lib/portal/session'

export const dynamic = 'force-dynamic'

export async function POST() {
  const token = cookies().get(PORTAL_COOKIE)?.value
  if (token) {
    try {
      const store = getPortalStore()
      await store.deleteSession(hashToken(token))
    } catch (error) {
      console.error('Portal logout failed:', error)
    }
  }
  const response = NextResponse.json({ ok: true })
  clearPortalCookie(response)
  return response
}
