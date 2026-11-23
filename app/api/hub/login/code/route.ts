import { NextResponse } from 'next/server'
import { issueHubSession, redeemStaffCode } from '@/lib/hub/auth'
import { setHubCookie } from '@/lib/hub/session'
import { getHubStore } from '@/lib/hub/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const hub = getHubStore()
    await hub.ensureReady()
    const body = await request.json().catch(() => null)
    const email =
      body && typeof body === 'object' && typeof (body as { email?: unknown }).email === 'string'
        ? (body as { email: string }).email
        : ''
    const code =
      body && typeof body === 'object' && typeof (body as { code?: unknown }).code === 'string'
        ? (body as { code: string }).code
        : ''
    const result = await redeemStaffCode(hub, email, code)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    const session = await issueHubSession(hub, result.email)
    const response = NextResponse.json({ ok: true })
    setHubCookie(response, session)
    return response
  } catch (error) {
    console.error('Hub code sign-in failed:', error instanceof Error ? error.message : 'error')
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
  }
}
