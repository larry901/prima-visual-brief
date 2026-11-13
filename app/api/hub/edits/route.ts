import { sampleStaffEdits } from '@/lib/hub/edits'
import { hubDenied, requireHubStaff } from '@/lib/hub/guard'
import { demoSeedEnabled } from '@/lib/portal/seed'
import { loadStaffEditBoard, notionConfigured } from '@/lib/portal/notion-edits'

export const dynamic = 'force-dynamic'

export async function POST() {
  const staff = await requireHubStaff()
  if (hubDenied(staff)) return staff
  const updatedAt = new Date().toISOString()
  if (!notionConfigured()) {
    return Response.json({
      ok: true,
      source: demoSeedEnabled() ? 'sample' : 'unconfigured',
      edits: demoSeedEnabled() ? sampleStaffEdits() : [],
      updatedAt,
    })
  }
  const board = await loadStaffEditBoard({ fresh: true })
  if (!board) {
    return Response.json({ error: 'Notion could not be read. Try again in a moment.' }, { status: 502 })
  }
  return Response.json({ ok: true, source: 'notion', edits: board.edits, updatedAt: board.fetchedAt })
}
