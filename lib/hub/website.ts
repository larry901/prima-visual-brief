import { authorizeBearer } from '../portal/ingest'
import { applyWebsiteLead, parseWebsiteLead } from './leads'
import type { HubStore } from './types'

/** Bearer token from WEBSITE_LEAD_TOKEN. Closed until that variable is set. */
export async function handleWebsiteLead(
  request: Request,
  hub: HubStore,
  token: string | undefined,
  now: Date = new Date(),
): Promise<Response> {
  if (!authorizeBearer(request.headers.get('authorization'), token)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = parseWebsiteLead(body)
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })
  const outcome = await applyWebsiteLead(parsed.value, hub, now)
  return Response.json({ ok: true, lead_id: outcome.leadId, action: outcome.action })
}
