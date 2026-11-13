import { chicagoToday } from '@/lib/portal/cycle'
import { hubDenied, requireHubStaff } from '@/lib/hub/guard'
import { snoozeFollowUp } from '@/lib/hub/followups'
import { parseLeadPatch } from '@/lib/hub/leads'
import { getHubStore } from '@/lib/hub/store'
import type { LeadPatch } from '@/lib/hub/types'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const staff = await requireHubStaff()
  if (hubDenied(staff)) return staff
  const id = Number(params.id)
  if (!Number.isInteger(id)) return Response.json({ error: 'Unknown lead' }, { status: 404 })
  const body = await request.json().catch(() => null)
  const parsed = parseLeadPatch(body)
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })
  const hub = getHubStore()
  const current = await hub.getLead(id)
  if (!current) return Response.json({ error: 'Unknown lead' }, { status: 404 })
  const { snooze, ...rest } = parsed.value
  const patch: LeadPatch = { ...rest }
  if (snooze) patch.nextFollowUp = snoozeFollowUp(chicagoToday(), snooze)
  if (patch.stage === 'Lost' && !(patch.lostReason ?? current.lostReason).trim()) {
    return Response.json({ error: 'Add a lost reason' }, { status: 400 })
  }
  try {
    const lead = await hub.updateLead(id, patch)
    return Response.json({ lead })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not update the lead' }, { status: 400 })
  }
}
