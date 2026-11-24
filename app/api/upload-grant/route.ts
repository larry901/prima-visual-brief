import { NextRequest, NextResponse } from 'next/server'
import {
  UPLOAD_GRANT_COOKIE,
  UPLOAD_GRANT_TTL_MS,
  authorizeBriefUpload,
  clientIpFromHeaders,
  signUploadGrant,
} from '@/lib/upload-guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const noStore = { 'Cache-Control': 'no-store' }

/** Short-lived cookie that lets the open brief form upload images and nothing else. */
export async function POST(req: NextRequest) {
  const secret = process.env.BLOB_READ_WRITE_TOKEN ?? ''
  const decision = authorizeBriefUpload({
    purpose: 'grant',
    host: req.nextUrl.host,
    origin: req.headers.get('origin'),
    secFetchSite: req.headers.get('sec-fetch-site'),
    cookie: null,
    secret,
    ip: clientIpFromHeaders(req.headers),
  })
  if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: decision.status, headers: noStore })

  const response = NextResponse.json({ ok: true }, { headers: noStore })
  response.cookies.set({
    name: UPLOAD_GRANT_COOKIE,
    value: signUploadGrant(secret),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(UPLOAD_GRANT_TTL_MS / 1000),
  })
  return response
}
