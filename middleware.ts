import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/dashboard-session'

const PUBLIC_API = new Set(['/api/dashboard/login', '/api/dashboard/logout'])

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname.replace(/\/$/, '') || '/'
  if (PUBLIC_API.has(pathname)) return NextResponse.next()

  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (token && (await verifySessionToken(token))) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const login = request.nextUrl.clone()
  login.pathname = '/dashboard'
  login.search = ''
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/dashboard/:path+', '/api/dashboard/:path+'],
}
