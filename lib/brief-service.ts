import type { BriefRow } from './db'
import { formatLongDate } from './portal/cycle'
import { changedBriefFields, briefEditClosesAt, briefIsEditable, canAccessBrief, type BriefOwner } from './brief-logic'
import type { PortalStore } from './portal/types'

export function briefSnapshot(brief: BriefRow): string {
  const copy: Partial<BriefRow> = { ...brief }
  delete copy.edit_token_hash
  delete copy.previous_snapshot
  return JSON.stringify(copy)
}

export async function shootStartsForClient(store: PortalStore, clientId: number | null): Promise<string[]> {
  if (clientId == null) return []
  const appointments = await store.listAppointmentsForClient(clientId)
  return appointments
    .filter((appointment) => !appointment.needsReview && appointment.status !== 'cancelled')
    .map((appointment) => appointment.startAt)
}

export function editWindow(brief: BriefRow, appointmentStarts: string[], now: Date) {
  const closesAt = briefEditClosesAt(brief.shoot_date, appointmentStarts)
  return { closesAt, editable: briefIsEditable(now, closesAt) }
}

export function assertCanEdit(
  brief: BriefRow,
  opts: { client?: BriefOwner | null; tokenHash?: string | null },
  appointmentStarts: string[],
  now: Date,
): { ok: true } | { ok: false; status: number; error: string } {
  if (!canAccessBrief(brief, opts)) return { ok: false, status: 404, error: 'Brief not found' }
  const { editable } = editWindow(brief, appointmentStarts, now)
  if (!editable) {
    return { ok: false, status: 403, error: 'This brief is locked because the shoot has started. Contact us for changes.' }
  }
  return { ok: true }
}

export function fieldsChanged(before: BriefRow, after: BriefUpdateShape): string[] {
  return changedBriefFields(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>)
}

export interface PortalBriefCard {
  id: number
  property: string
  shootLabel: string
  submittedLabel: string
  editable: boolean
}

export async function portalBriefCards(store: PortalStore, client: BriefOwner, now = new Date()): Promise<PortalBriefCard[]> {
  const [briefs, starts] = await Promise.all([
    store.listBriefsForClient(client.id, client.email),
    shootStartsForClient(store, client.id),
  ])
  return briefs.map((brief) => ({
    id: brief.id,
    property: brief.property_address,
    shootLabel: formatLongDate(brief.shoot_date.slice(0, 10)),
    submittedLabel: new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(brief.submitted_at)),
    editable: editWindow(brief, starts, now).editable,
  }))
}

export function prefillFromBrief(brief: BriefRow) {
  return {
    agentName: brief.agent_name,
    email: brief.client_email || brief.client_name || '',
    shootDate: brief.shoot_date.slice(0, 10),
    propertyAddress: brief.property_address,
    agentOnSite: brief.agent_on_site,
    gateCode: brief.gate_code || '',
    lockboxCode: brief.lockbox_code || '',
    accessNotes: brief.access_notes || '',
    videoTypes: JSON.parse(brief.video_types || '[]') as string[],
    videoDetails: JSON.parse(brief.video_details || '{}'),
    driveLink: brief.drive_link || '',
    assetNotes: brief.asset_notes || '',
  }
}

interface BriefUpdateShape {
  agent_name: string
  property_address: string
  shoot_date: string
  agent_on_site: string
  gate_code: string | null
  lockbox_code: string | null
  access_notes: string | null
  video_types: string
  video_details: string
  drive_link: string | null
  asset_notes: string | null
}
