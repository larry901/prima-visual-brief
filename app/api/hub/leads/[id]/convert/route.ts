import { convertLeadToClient } from '@/lib/hub/convert'
import { hubDenied, requireHubStaff } from '@/lib/hub/guard'
import { getHubStore } from '@/lib/hub/store'
import { getPortalStore } from '@/lib/portal/store'
import type { ClientKind, PlanSize } from '@/lib/portal/types'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const staff = await requireHubStaff()
  if (hubDenied(staff)) return staff
  const id = Number(params.id)
  if (!Number.isInteger(id)) return Response.json({ error: 'Unknown lead' }, { status: 404 })
  const lead = await getHubStore().getLead(id)
  if (!lead) return Response.json({ error: 'Unknown lead' }, { status: 404 })
  const body = await request.json().catch(() => null)
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const kind: ClientKind = record.kind === 'project' ? 'project' : 'subscription'
  const planSize = record.planSize === 1 || record.planSize === 2 || record.planSize === 4 ? (record.planSize as PlanSize) : null
  const renewalDate = typeof record.renewalDate === 'string' ? record.renewalDate : null
  try {
    const result = await convertLeadToClient(getHubStore(), getPortalStore(), lead, { kind, planSize, renewalDate })
    return Response.json({ ok: true, ...result })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not add the client' }, { status: 400 })
  }
}
