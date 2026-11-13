import { addMonths, isIsoDate } from '../portal/cycle'
import type { ClientInput, ClientKind, PlanSize, PortalStore } from '../portal/types'
import type { HubStore, LeadRecord } from './types'

export interface ConvertChoices {
  kind: ClientKind
  planSize: PlanSize | null
  renewalDate: string | null
}

/** Fields the roster form should show before a Won lead becomes a client. */
export function prefillFromLead(lead: LeadRecord, today: string): ConvertChoices {
  const kind: ClientKind = lead.serviceType === 'project' ? 'project' : 'subscription'
  if (kind === 'project') return { kind, planSize: null, renewalDate: null }
  const anchor = Number(today.slice(8, 10))
  return {
    kind,
    planSize: 1,
    renewalDate: isIsoDate(today) ? addMonths(today, 1, anchor) : null,
  }
}

export function clientInputFromLead(lead: LeadRecord, choices: ConvertChoices): ClientInput {
  const subscription = choices.kind === 'subscription'
  return {
    name: lead.name.trim(),
    email: lead.email,
    company: lead.company.trim(),
    kind: choices.kind,
    planSize: subscription ? choices.planSize : null,
    renewalDate: subscription ? choices.renewalDate : null,
    schedulingLink: null,
    frameioUrl: null,
    active: true,
  }
}

export async function convertLeadToClient(
  hub: HubStore,
  portal: PortalStore,
  lead: LeadRecord,
  choices: ConvertChoices,
): Promise<{ clientId: number; created: boolean }> {
  if (lead.stage !== 'Won') throw new Error('Only a won lead can be added to the roster')
  if (!lead.email) throw new Error('Add an email before adding this lead to the roster')
  if (lead.convertedClientId) {
    const existing = await portal.getClient(lead.convertedClientId)
    if (existing) return { clientId: existing.id, created: false }
  }
  const already = await portal.findClientByEmail(lead.email)
  if (already) {
    await hub.updateLead(lead.id, { convertedClientId: already.id })
    return { clientId: already.id, created: false }
  }
  if (choices.kind === 'subscription') {
    if (choices.planSize !== 1 && choices.planSize !== 2 && choices.planSize !== 4) {
      throw new Error('Choose a 1, 2, or 4 shoot plan')
    }
    if (!choices.renewalDate || !isIsoDate(choices.renewalDate)) {
      throw new Error('Choose a renewal date')
    }
  }
  const created = await portal.createClient(clientInputFromLead(lead, choices))
  await hub.updateLead(lead.id, { convertedClientId: created.id })
  return { clientId: created.id, created: true }
}
