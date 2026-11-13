import { NextResponse } from 'next/server'
import { hubDenied, requireHubStaff } from '@/lib/hub/guard'
import { attachClientEmails, parseClientInput } from '@/lib/portal/clients'
import { removeRosterClient } from '@/lib/portal/remove-client'
import { getHubStore } from '@/lib/hub/store'
import { getPortalStore } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const staff = await requireHubStaff()
  if (hubDenied(staff)) return staff
  const id = Number(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid client' }, { status: 400 })
  const parsed = parseClientInput(await request.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  try {
    const store = getPortalStore()
    await store.ensureReady()
    const client = await store.updateClient(id, parsed.value)
    await attachClientEmails(store, client)
    return NextResponse.json({ client })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save client'
    const status = /not found/.test(message) ? 404 : /already exists/.test(message) ? 409 : 500
    if (status === 500) console.error(error)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const staff = await requireHubStaff()
  if (hubDenied(staff)) return staff
  const id = Number(params.id)
  const body = await request.json().catch(() => null)
  const confirmName = body && typeof body === 'object' ? (body as { confirmName?: unknown }).confirmName : undefined
  try {
    const portal = getPortalStore()
    const hub = getHubStore()
    await portal.ensureReady()
    await hub.ensureReady()
    const result = await removeRosterClient(portal, hub, id, confirmName)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Could not delete client' }, { status: 500 })
  }
}
