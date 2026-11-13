import type { ClientInput, ClientRecord, PortalStore } from '../portal/types'
import type { HubStore } from './types'

/** The stored client, ready for updateClient. Optional active override for the one-tap toggle. */
export function clientInputFromRecord(client: ClientRecord, active: boolean = client.active): ClientInput {
  return {
    name: client.name,
    email: client.email,
    additionalEmails: client.additionalEmails,
    company: client.company,
    kind: client.kind,
    planSize: client.planSize,
    renewalDate: client.renewalDate,
    schedulingLink: client.schedulingLink,
    frameioUrl: client.frameioUrl,
    notionClientId: client.notionClientId,
    active,
  }
}

export function deleteNameMatches(typed: string, name: string): boolean {
  const expected = name.trim()
  return expected.length > 0 && typed.trim() === expected
}

export async function setClientActive(store: PortalStore, id: number, active: boolean): Promise<ClientRecord> {
  const client = await store.getClient(id)
  if (!client) throw new Error('Client not found')
  return store.updateClient(id, clientInputFromRecord(client, active))
}

/**
 * Delete the roster row without deleting appointments or briefs.
 * Appointments keep their type, time, status, and review flag; only the client link is cleared.
 * Briefs keep their text; client_id is cleared so pages do not follow a missing client.
 * A converted lead no longer claims this client is on the roster.
 */
export async function removeRosterClient(portal: PortalStore, hub: HubStore, id: number): Promise<boolean> {
  const client = await portal.getClient(id)
  if (!client) return false
  const leads = await hub.listLeads()
  for (const lead of leads) {
    if (lead.convertedClientId === id) {
      await hub.updateLead(lead.id, { convertedClientId: null })
    }
  }
  await hub.setClientPrice(id, null)
  return portal.deleteClient(id)
}
