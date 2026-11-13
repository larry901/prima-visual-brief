import { hubDenied, requireHubStaff } from '@/lib/hub/guard'
import { getHubStore } from '@/lib/hub/store'
import { parseWonDeal } from '@/lib/hub/won-deals'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const staff = await requireHubStaff()
  if (hubDenied(staff)) return staff
  const parsed = parseWonDeal(await request.json().catch(() => null))
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })
  try {
    const deal = await getHubStore().createWonDeal(parsed.value)
    return Response.json({ deal })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not log the deal' }, { status: 400 })
  }
}
