import { NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { parseCountedTypes } from '@/lib/portal/clients'
import { getPortalStore } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

export async function PUT(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const types = parseCountedTypes(
    body && typeof body === 'object' ? (body as { countedTypes?: unknown }).countedTypes : null,
  )
  if (!types.ok) return NextResponse.json({ error: types.error }, { status: 400 })
  try {
    const store = getPortalStore()
    await store.ensureReady()
    await store.setCountedTypes(types.value)
    return NextResponse.json({ countedTypes: types.value })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Could not save appointment types' }, { status: 500 })
  }
}
