import { authorizeBearer } from '../portal/ingest'
import { applyWebsiteLead, parseWebsiteLead } from './leads'
import type { HubStore } from './types'

function acceptedTokens(token: string | undefined | readonly (string | undefined)[]): string[] {
  const list = typeof token === 'string' || token == null ? [token] : token
  const unique: string[] = []
  for (const entry of list) {
    const trimmed = entry?.trim()
    if (!trimmed || unique.includes(trimmed)) continue
    unique.push(trimmed)
  }
  return unique
}

/**
 * Bearer token from WEBSITE_LEAD_TOKEN, or ACUITY_INGEST_TOKEN when the same bot
 * posts the lead. Closed when neither secret is set. Either secret works when both are set.
 */
export async function handleWebsiteLead(
  request: Request,
  hub: HubStore,
  token: string | undefined | readonly (string | undefined)[],
  now: Date = new Date(),
): Promise<Response> {
  const tokens = acceptedTokens(token)
  const header = request.headers.get('authorization')
  if (!tokens.some((secret) => authorizeBearer(header, secret))) {
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
