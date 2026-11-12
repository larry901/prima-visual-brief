import { NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { requestOrigin } from '@/lib/portal/origin'
import { personalLinkUrl, resetPersonalLink } from '@/lib/portal/personal-link'
import { getPortalStore } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = Number(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid client' }, { status: 400 })
  try {
    const store = getPortalStore()
    await store.ensureReady()
    const token = await resetPersonalLink(store, id)
    return NextResponse.json({ url: personalLinkUrl(requestOrigin(request), token) })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/not found/.test(message)) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    console.error('Could not reset personal link')
    return NextResponse.json({ error: 'Could not reset link' }, { status: 500 })
  }
}
