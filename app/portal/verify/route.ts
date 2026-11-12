import { NextRequest, NextResponse } from 'next/server'
import { requestOrigin } from '@/lib/portal/origin'
import { setPortalCookie } from '@/lib/portal/session'
import { getPortalStore } from '@/lib/portal/store'
import { hashToken, issuePortalSession } from '@/lib/portal/tokens'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')?.trim()
  const origin = requestOrigin(request)
  if (!token) return NextResponse.redirect(`${origin}/portal?error=link`)
  try {
    const store = getPortalStore()
    await store.ensureReady()
    const client = await store.consumeMagicLink(hashToken(token), new Date().toISOString())
    if (!client) return NextResponse.redirect(`${origin}/portal?error=link`)
    const session = await issuePortalSession(store, client.id)
    const response = NextResponse.redirect(`${origin}/portal`)
    setPortalCookie(response, session)
    return response
  } catch (error) {
    console.error('Portal verify failed:', error)
    return NextResponse.redirect(`${origin}/portal?error=link`)
  }
}
