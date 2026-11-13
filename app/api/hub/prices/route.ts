import { hubDenied, requireHubStaff } from '@/lib/hub/guard'
import { isPlanSize, parseDollars } from '@/lib/hub/money'
import { getHubStore } from '@/lib/hub/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const staff = await requireHubStaff()
  if (hubDenied(staff)) return staff
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return Response.json({ error: 'Expected a JSON object' }, { status: 400 })
  const record = body as Record<string, unknown>
  const hub = getHubStore()
  try {
    if ('planSize' in record) {
      const planSize = Number(record.planSize)
      if (!isPlanSize(planSize)) return Response.json({ error: 'Plan must be 1, 2, or 4' }, { status: 400 })
      const monthly = record.monthlyDollars == null || record.monthlyDollars === '' ? null : parseDollars(record.monthlyDollars)
      await hub.setPlanPrice(planSize, monthly)
      return Response.json({ ok: true })
    }
    if ('clientId' in record) {
      const clientId = Number(record.clientId)
      if (!Number.isInteger(clientId)) return Response.json({ error: 'Unknown client' }, { status: 400 })
      const monthly = record.monthlyDollars == null || record.monthlyDollars === '' ? null : parseDollars(record.monthlyDollars)
      await hub.setClientPrice(clientId, monthly)
      return Response.json({ ok: true })
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not save the price' }, { status: 400 })
  }
  return Response.json({ error: 'Send a planSize or a clientId' }, { status: 400 })
}
