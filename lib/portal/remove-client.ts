import type { HubStore } from '../hub/types'
import type { PortalStore } from './types'

export type RemoveClientResult = { ok: true } | { ok: false; status: number; error: string }

/**
 * Removes the roster row after the caller types the client's name.
 * Appointments stay, with the client cleared, so shoot-count history and the
 * needs-review queue keep their rows. Briefs stay, with the client cleared, so
 * the dashboard can still open them and no page looks up a missing client.
 * Hub price rows and a lead's converted-client pointer are dropped with the client.
 * Sessions, extra emails, and the personal link go away with the row, which
 * already stops an inactive client from signing in.
 */
export async function removeRosterClient(
  portal: PortalStore,
  hub: HubStore,
  clientId: number,
  confirmName: unknown,
): Promise<RemoveClientResult> {
  if (!Number.isInteger(clientId)) return { ok: false, status: 400, error: 'Invalid client' }
  const client = await portal.getClient(clientId)
  if (!client) return { ok: false, status: 404, error: 'Client not found' }
  if (typeof confirmName !== 'string' || confirmName.trim() !== client.name.trim()) {
    return { ok: false, status: 400, error: "Type the client's name exactly to delete them." }
  }
  await hub.releaseClient(clientId)
  await portal.deleteClient(clientId)
  return { ok: true }
}
