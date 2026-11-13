import { hubDenied, requireHubStaff } from '@/lib/hub/guard'
import { parseManualLead } from '@/lib/hub/leads'
import { getHubStore } from '@/lib/hub/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const staff = await requireHubStaff()
  if (hubDenied(staff)) return staff
  const hub = getHubStore()
  const leads = await hub.listLeads()
  return Response.json({ leads })
}

export async function POST(request: Request) {
  const staff = await requireHubStaff()
  if (hubDenied(staff)) return staff
  const body = await request.json().catch(() => null)
  const parsed = parseManualLead(body)
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })
  try {
    const lead = await getHubStore().createLead(parsed.value)
    return Response.json({ lead }, { status: 201 })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not save the lead' }, { status: 400 })
  }
}
