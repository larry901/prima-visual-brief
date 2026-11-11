import { NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { getPortalStore } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  if (!isAuthenticated()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = Number(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid review' }, { status: 400 })
  try {
    const store = getPortalStore()
    await store.ensureReady()
    const removed = await store.dismissReview(id)
    if (!removed) return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Could not dismiss review' }, { status: 500 })
  }
}
