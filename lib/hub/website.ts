import { authorizeBearer } from '../portal/ingest'
import { applyWebsiteLead, parseWebsiteLead } from './leads'
import type { HubStore } from './types'

export interface WebsiteLeadTokens {
  /** Dedicated token. Still accepted when set. */
  website?: string
  /**
   * The Gmail bot already holds this for Acuity. Squarespace forms cannot send a
   * custom header, so that bot may post form-submission emails with this token too.
   */
  acuity?: string
}

/** True when the bearer matches either configured token. Both are checked. */
export function websiteLeadAuthorized(header: string | null, tokens: WebsiteLeadTokens): boolean {
  const website = authorizeBearer(header, tokens.website)
  const acuity = authorizeBearer(header, tokens.acuity)
  return website || acuity
}

/**
 * Closed until WEBSITE_LEAD_TOKEN or ACUITY_INGEST_TOKEN is set.
 * Either bearer is enough. The route does not say which one matched.
 */
export async function handleWebsiteLead(
  request: Request,
  hub: HubStore,
  tokens: WebsiteLeadTokens,
  now: Date = new Date(),
): Promise<Response> {
  if (!websiteLeadAuthorized(request.headers.get('authorization'), tokens)) {
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
