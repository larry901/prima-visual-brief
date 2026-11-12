import { NextResponse } from 'next/server'
import { redeemPersonalLink } from '@/lib/portal/personal-link'
import { setPortalCookie } from '@/lib/portal/session'
import { getPortalStore } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const token = body && typeof body === 'object' && typeof (body as { token?: unknown }).token === 'string'
      ? (body as { token: string }).token
      : ''
    const email = body && typeof body === 'object' && typeof (body as { email?: unknown }).email === 'string'
      ? (body as { email: string }).email
      : ''
    const store = getPortalStore()
    await store.ensureReady()
    const result = await redeemPersonalLink(store, token, email)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    const response = NextResponse.json({ ok: true })
    setPortalCookie(response, result.sessionToken)
    return response
  } catch (error) {
    console.error('Personal link sign-in failed:', error)
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
  }
}
