import { hubDenied, requireHubStaff } from '@/lib/hub/guard'
import { parseNotionPageId } from '@/lib/portal/notion-id'
import { getPortalStore } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const staff = await requireHubStaff()
  if (hubDenied(staff)) return staff
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'Unknown brief' }, { status: 404 })
  }
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || !('pageId' in body)) {
    return Response.json({ error: 'Expected a pageId' }, { status: 400 })
  }
  const raw = (body as { pageId?: unknown }).pageId
  let pageId: string | null
  if (raw == null || raw === '') pageId = null
  else if (typeof raw !== 'string') return Response.json({ error: 'Paste a Notion page link or id' }, { status: 400 })
  else {
    pageId = parseNotionPageId(raw)
    if (!pageId) return Response.json({ error: 'Paste a Notion page link or id' }, { status: 400 })
  }
  const store = getPortalStore()
  await store.ensureReady()
  const existing = await store.getBriefById(id)
  if (!existing) return Response.json({ error: 'Unknown brief' }, { status: 404 })
  try {
    const saved = await store.setBriefNotionLink(id, pageId, 'manual')
    return Response.json({ ok: true, pageId: saved.notion_edit_page_id, link: saved.notion_edit_link })
  } catch (error) {
    console.error('Could not save a brief edit link', error instanceof Error ? error.message : 'error')
    return Response.json({ error: 'Could not save the Edit link.' }, { status: 400 })
  }
}
