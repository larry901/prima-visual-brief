import { addMonths, chicagoDate, chicagoToday, chicagoWallTimeToUtc, isIsoDate } from './portal/cycle'

export interface BriefOwner {
  id: number
  email: string
}

export interface BriefAccessRow {
  client_id?: number | null
  client_email?: string | null
  client_name?: string | null
  agent_name?: string | null
  edit_token_hash?: string | null
}

/** A brief belongs to a client by their roster id or their email. Names alone never match. */
export function clientOwnsBrief(brief: BriefAccessRow, client: BriefOwner): boolean {
  if (brief.client_id != null && Number(brief.client_id) === client.id) return true
  const email = client.email.trim().toLowerCase()
  if (!email) return false
  if ((brief.client_email || '').trim().toLowerCase() === email) return true
  if ((brief.client_name || '').trim().toLowerCase() === email) return true
  return false
}

export function canAccessBrief(
  brief: BriefAccessRow,
  opts: { client?: BriefOwner | null; tokenHash?: string | null },
): boolean {
  if (opts.tokenHash && brief.edit_token_hash && opts.tokenHash === brief.edit_token_hash) return true
  if (opts.client && clientOwnsBrief(brief, opts.client)) return true
  return false
}

/**
 * Editing stays open until the shoot starts.
 * A same-day appointment time is the start. Otherwise the shoot date begins at midnight in Chicago.
 */
export function briefEditClosesAt(shootDate: string, appointmentStarts: string[] = []): Date | null {
  const day = shootDate.slice(0, 10)
  if (!isIsoDate(day)) return null
  const sameDay = appointmentStarts
    .filter((iso) => {
      const parsed = new Date(iso)
      return !Number.isNaN(parsed.getTime()) && chicagoDate(parsed) === day
    })
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
  if (sameDay[0]) return new Date(sameDay[0])
  return chicagoWallTimeToUtc(day, 0, 0)
}

export function briefIsEditable(now: Date, closesAt: Date | null): boolean {
  if (!closesAt) return false
  return now.getTime() < closesAt.getTime()
}

const COMPARED_FIELDS: Array<[string, string]> = [
  ['agent_name', 'Agent name'],
  ['property_address', 'Property'],
  ['shoot_date', 'Shoot date'],
  ['agent_on_site', 'Agent on site'],
  ['gate_code', 'Gate code'],
  ['lockbox_code', 'Lockbox code'],
  ['access_notes', 'Access notes'],
  ['video_types', 'Video types'],
  ['video_details', 'Video details'],
  ['drive_link', 'Drive link'],
  ['asset_notes', 'Asset notes'],
]

export function changedBriefFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  return COMPARED_FIELDS.filter(([key]) => stable(before[key]) !== stable(after[key])).map(([, label]) => label)
}

/** Calendar day used for the portal list: shoot date, or the Chicago day it was submitted. */
export function briefPortalDate(shootDate?: string | null, submittedAt?: string | null): string | null {
  const shoot = (shootDate || '').trim().slice(0, 10)
  if (isIsoDate(shoot)) return shoot
  if (!submittedAt) return null
  const parsed = new Date(submittedAt)
  if (Number.isNaN(parsed.getTime())) return null
  return chicagoDate(parsed)
}

/** Two calendar months before today in America/Chicago, same day-of-month when it exists. */
export function briefPortalCutoff(now: Date = new Date()): string {
  const today = chicagoToday(now)
  return addMonths(today, -2, Number(today.slice(8, 10)))
}

/**
 * Portal list only. Upcoming shoots always stay. Older rows stay in the database
 * and on the admin dashboard; this only decides the client list.
 */
export function briefShownInPortal(
  brief: { shoot_date?: string | null; submitted_at?: string | null },
  now: Date = new Date(),
): boolean {
  const day = briefPortalDate(brief.shoot_date, brief.submitted_at)
  if (!day) return false
  const today = chicagoToday(now)
  if (day >= today) return true
  return day >= briefPortalCutoff(now)
}

function stable(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.stringify(JSON.parse(trimmed))
      } catch {
        return trimmed
      }
    }
    return trimmed
  }
  return JSON.stringify(value)
}
