import { deleteNameMatches, removeRosterClient, setClientActive } from '@/lib/hub/roster'
import { hubDenied, requireHubStaff } from '@/lib/hub/guard'
import { parseDollars } from '@/lib/hub/money'
import { getHubStore } from '@/lib/hub/store'
import { attachClientEmails, parseClientInput } from '@/lib/portal/clients'
import { getPortalStore } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const staff = await requireHubStaff()
  if (hubDenied(staff)) return staff
  const id = Number(params.id)
  if (!Number.isInteger(id)) return Response.json({ error: 'Invalid client' }, { status: 400 })
  const body = await request.json().catch(() => null)
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  if (!record) return Response.json({ error: 'Expected a JSON object' }, { status: 400 })
  const portal = getPortalStore()
  const hub = getHubStore()
  try {
    await portal.ensureReady()
    await hub.ensureReady()
    if (!('name' in record) && typeof record.active === 'boolean' && Object.keys(record).length === 1) {
      const client = await setClientActive(portal, id, record.active)
      return Response.json({ client })
    }
    const parsed = parseClientInput(record)
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })
    const client = await portal.updateClient(id, parsed.value)
    await attachClientEmails(portal, client)
    if ('monthlyDollars' in record) {
      const monthly = record.monthlyDollars == null || record.monthlyDollars === '' ? null : parseDollars(record.monthlyDollars)
      await hub.setClientPrice(id, monthly)
    }
    return Response.json({ client })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save client'
    const status = /not found/.test(message) ? 404 : /already exists/.test(message) ? 409 : /dollar|email|URL|Plan|Renewal|Notion/.test(message) ? 400 : 500
    if (status === 500) console.error(message)
    return Response.json({ error: message }, { status })
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const staff = await requireHubStaff()
  if (hubDenied(staff)) return staff
  const id = Number(params.id)
  if (!Number.isInteger(id)) return Response.json({ error: 'Invalid client' }, { status: 400 })
  const body = await request.json().catch(() => null)
  const confirmName = body && typeof body === 'object' && typeof (body as { confirmName?: unknown }).confirmName === 'string'
    ? (body as { confirmName: string }).confirmName
    : ''
  const portal = getPortalStore()
  const hub = getHubStore()
  await portal.ensureReady()
  await hub.ensureReady()
  const client = await portal.getClient(id)
  if (!client) return Response.json({ error: 'Client not found' }, { status: 404 })
  if (!deleteNameMatches(confirmName, client.name)) {
    return Response.json({ error: 'Type the client name to confirm deletion.' }, { status: 400 })
  }
  const removed = await removeRosterClient(portal, hub, id)
  if (!removed) return Response.json({ error: 'Client not found' }, { status: 404 })
  return Response.json({ ok: true })
}
