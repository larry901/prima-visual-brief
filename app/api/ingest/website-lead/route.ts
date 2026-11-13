import { getHubStore } from '@/lib/hub/store'
import { handleWebsiteLead } from '@/lib/hub/website'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const hub = getHubStore()
    await hub.ensureReady()
    return handleWebsiteLead(request, hub, process.env.WEBSITE_LEAD_TOKEN)
  } catch (error) {
    console.error('Website lead ingest failed:', error instanceof Error ? error.message : 'error')
    return Response.json({ error: 'Ingest failed' }, { status: 500 })
  }
}
