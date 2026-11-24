import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { del } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'
import { SCRIPT_PHOTO_MAX_BYTES, SCRIPT_PHOTO_TYPES, parseBlobScriptPhotoUrl } from '@/lib/script-photos'
import { UPLOAD_GRANT_COOKIE, authorizeBriefUpload, clientIpFromHeaders } from '@/lib/upload-guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const noStore = { 'Cache-Control': 'no-store' }

function uploadError(error: unknown) {
  if (error instanceof Error && typeof (error as Error & { status?: unknown }).status === 'number') {
    const status = (error as Error & { status: number }).status
    return NextResponse.json({ error: error.message }, { status, headers: noStore })
  }
  console.error('Upload error:', error instanceof Error ? error.message : 'error')
  return NextResponse.json({ error: 'Upload failed' }, { status: 400, headers: noStore })
}

function guardInput(req: NextRequest, purpose: 'token' | 'delete', target: string | null) {
  return authorizeBriefUpload({
    purpose,
    host: req.nextUrl.host,
    origin: req.headers.get('origin'),
    secFetchSite: req.headers.get('sec-fetch-site'),
    cookie: req.cookies.get(UPLOAD_GRANT_COOKIE)?.value ?? null,
    secret: process.env.BLOB_READ_WRITE_TOKEN ?? '',
    target,
    ip: clientIpFromHeaders(req.headers),
  })
}

/**
 * Mints a client token so the browser can upload an image straight to Blob.
 * The brief form is public, so this is limited to same-origin brief sessions,
 * image types, an 8 MB cap, and a per-IP rate limit. Bytes never hit this function.
 */
export async function POST(req: NextRequest) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (!blobToken) {
    return NextResponse.json({ error: 'Photo upload is not configured.' }, { status: 503, headers: noStore })
  }
  let body: HandleUploadBody
  try {
    body = (await req.json()) as HandleUploadBody
  } catch {
    return NextResponse.json({ error: 'Upload failed' }, { status: 400, headers: noStore })
  }

  try {
    const json = await handleUpload({
      request: req,
      body,
      token: blobToken,
      onBeforeGenerateToken: async (pathname) => {
        const decision = guardInput(req, 'token', pathname)
        if (!decision.ok) throw Object.assign(new Error(decision.error), { status: decision.status })
        return {
          allowedContentTypes: [...SCRIPT_PHOTO_TYPES],
          maximumSizeInBytes: SCRIPT_PHOTO_MAX_BYTES,
          addRandomSuffix: true,
          allowOverwrite: false,
          validUntil: Date.now() + 10 * 60 * 1000,
        }
      },
    })
    return NextResponse.json(json, { headers: noStore })
  } catch (error) {
    return uploadError(error)
  }
}

/** Deletes a photo the client added and then removed before saving the brief. */
export async function DELETE(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Photo upload is not configured.' }, { status: 503, headers: noStore })
  }
  let url = ''
  try {
    const body = (await req.json()) as { url?: unknown }
    if (typeof body.url === 'string') url = body.url
  } catch {
    url = ''
  }
  const parsed = parseBlobScriptPhotoUrl(url)
  const decision = guardInput(req, 'delete', parsed?.url ?? url)
  if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: decision.status, headers: noStore })
  if (!parsed) return NextResponse.json({ error: 'That photo could not be removed.' }, { status: 400, headers: noStore })
  try {
    await del(parsed.url, { token: process.env.BLOB_READ_WRITE_TOKEN })
  } catch (error) {
    console.error('Could not delete a reference photo', error instanceof Error ? error.message : 'error')
    return NextResponse.json({ error: 'That photo could not be removed.' }, { status: 500, headers: noStore })
  }
  return NextResponse.json({ ok: true }, { headers: noStore })
}
