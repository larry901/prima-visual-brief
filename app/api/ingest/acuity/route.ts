import { handleAcuityIngest } from '@/lib/portal/ingest'
import { getPortalStore } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const store = getPortalStore()
    await store.ensureReady()
    return handleAcuityIngest(request, store, process.env.ACUITY_INGEST_TOKEN)
  } catch (error) {
    console.error('Acuity ingest failed:', error)
    return Response.json({ error: 'Ingest failed' }, { status: 500 })
  }
}
