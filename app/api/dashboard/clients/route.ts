import { NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { parseClientInput } from '@/lib/portal/clients'
import { getPortalStore } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isAuthenticated()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = parseClientInput(await request.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  try {
    const store = getPortalStore()
    await store.ensureReady()
    const client = await store.createClient(parsed.value)
    await store.attachUnmatched(client.email, client.id)
    return NextResponse.json({ client })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save client'
    const status = /already exists/.test(message) ? 409 : 500
    if (status === 500) console.error(error)
    return NextResponse.json({ error: message }, { status })
  }
}
