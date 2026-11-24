import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { scriptPhotosForApi } from '@/lib/script-photos'
import { getPortalStore } from '@/lib/portal/store'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = Number(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const store = getPortalStore()
  await store.ensureReady()
  const brief = await store.getBriefById(id)
  if (!brief) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    brief,
    // Stable public image URLs, keyed by video type, for Notion external image blocks.
    scriptPhotos: scriptPhotosForApi(brief.video_details),
  })
}
