import { hubDenied, requireHubStaff } from '@/lib/hub/guard'
import { getHubStore } from '@/lib/hub/store'
import { isTouchKind } from '@/lib/hub/types'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const staff = await requireHubStaff()
  if (hubDenied(staff)) return staff
  const id = Number(params.id)
  if (!Number.isInteger(id)) return Response.json({ error: 'Unknown lead' }, { status: 404 })
  const body = await request.json().catch(() => null)
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  if (!isTouchKind(record.kind)) return Response.json({ error: 'kind must be call, text, dm, or email' }, { status: 400 })
  const note = record.note == null ? '' : typeof record.note === 'string' ? record.note.trim().slice(0, 2000) : null
  if (note == null) return Response.json({ error: 'note must be a string' }, { status: 400 })
  try {
    const touch = await getHubStore().addTouch({ leadId: id, kind: record.kind, note })
    return Response.json({ touch }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not log the touch'
    return Response.json({ error: message }, { status: message === 'Lead not found' ? 404 : 400 })
  }
}
