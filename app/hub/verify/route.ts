import { NextRequest, NextResponse } from 'next/server'
import { issueHubSession } from '@/lib/hub/auth'
import { setHubCookie } from '@/lib/hub/session'
import { getHubStore } from '@/lib/hub/store'
import { requestOrigin } from '@/lib/portal/origin'
import { hashToken } from '@/lib/portal/tokens'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')?.trim()
  const origin = requestOrigin(request)
  if (!token) return NextResponse.redirect(`${origin}/hub/login?error=link`)
  try {
    const hub = getHubStore()
    await hub.ensureReady()
    const email = await hub.consumeStaffMagicLink(hashToken(token), new Date().toISOString())
    if (!email) return NextResponse.redirect(`${origin}/hub/login?error=link`)
    const session = await issueHubSession(hub, email)
    const response = NextResponse.redirect(`${origin}/hub/`)
    setHubCookie(response, session)
    return response
  } catch (error) {
    console.error('Hub verify failed:', error instanceof Error ? error.message : 'error')
    return NextResponse.redirect(`${origin}/hub/login?error=link`)
  }
}
