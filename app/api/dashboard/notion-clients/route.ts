import { NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { listNotionClients, notionConfigured } from '@/lib/portal/notion-edits'

export const dynamic = 'force-dynamic'

/** Staff-only list of Notion Clients pages for the roster dropdown. */
export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!notionConfigured()) return NextResponse.json({ configured: false, clients: [] })
  try {
    const clients = await listNotionClients()
    return NextResponse.json({ configured: true, clients })
  } catch (error) {
    console.error('Notion client list failed', error instanceof Error ? error.message : 'error')
    return NextResponse.json({ configured: true, clients: [], unavailable: true })
  }
}
