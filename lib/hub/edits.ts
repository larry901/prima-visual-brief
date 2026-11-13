import { addDays, chicagoDate, isIsoDate } from '../portal/cycle'
import { calendarDaysBetween, type NotionEditSnapshot } from '../portal/video-progress'
import { parseNotionPageId } from '../portal/notion-id'

export const STAFF_STATUS_ORDER = [
  'Not Started',
  'Uploaded',
  'Edit Started',
  'Revisions Needed',
  'Internal Approval',
  'Ready to Go',
  'Sent for Approval',
  'Client Revision',
  'Completed',
] as const

export interface HubEditBoard {
  configured: boolean
  unavailable: boolean
  usingSample: boolean
  edits: StaffEdit[]
  fetchedAt: string
}

export const SENT_FOR_APPROVAL = 'Sent for Approval'
/** Inclusive Chicago calendar window. Notion has no status-changed date, so this uses last edited time. */
export const SENT_FOR_APPROVAL_DAYS = 30

export interface StaffEdit {
  id: string
  name: string
  status: string
  clientName: string
  shotOn: string | null
  dueLabel: string | null
  completedOn: string | null
  turnaroundDays: number | null
  notionUrl: string
  lastEditedAt: string | null
}

export function notionPageUrl(pageId: string): string {
  return `https://www.notion.so/${pageId.replace(/-/g, '')}`
}

function completedStatus(status: string): boolean {
  const key = status.trim().toLowerCase()
  return key === 'completed' || key === 'approved'
}

export function staffEditFromSnapshot(
  page: NotionEditSnapshot,
  clientNames: ReadonlyMap<string, string>,
): StaffEdit {
  const names = page.clientIds
    .map((id) => clientNames.get(parseNotionPageId(id) ?? '') ?? '')
    .filter(Boolean)
  let turnaroundDays: number | null = null
  if (
    completedStatus(page.status ?? '') &&
    page.shotOn &&
    page.completedOn &&
    isIsoDate(page.shotOn) &&
    isIsoDate(page.completedOn)
  ) {
    const days = calendarDaysBetween(page.shotOn, page.completedOn)
    if (days >= 0 && days < 365) turnaroundDays = days
  }
  return {
    id: page.id,
    name: page.name,
    status: page.status?.trim() || 'No status',
    clientName: names.length > 0 ? names.join(', ') : 'Unassigned',
    shotOn: page.shotOn,
    dueLabel: page.dueOn || page.dueText,
    completedOn: page.completedOn,
    turnaroundDays,
    notionUrl: notionPageUrl(page.id),
    lastEditedAt: page.lastEditedAt,
  }
}

/**
 * Sent for Approval keeps videos whose Notion page was last edited within the window.
 * The Edit database stores Status, Date Shot, Client Due Date, and Completed Date.
 * It does not store when the status changed, so last_edited_time is the date we have.
 * A row with no last-edited time is left out of that group. Every other status stays.
 */
export function filterStaffEdits(edits: readonly StaffEdit[], today: string): StaffEdit[] {
  const cutoff = addDays(today, -SENT_FOR_APPROVAL_DAYS)
  return edits.filter((edit) => {
    if (edit.status !== SENT_FOR_APPROVAL) return true
    if (!edit.lastEditedAt) return false
    const parsed = new Date(edit.lastEditedAt)
    if (Number.isNaN(parsed.getTime())) return false
    const day = chicagoDate(parsed)
    return isIsoDate(day) && day >= cutoff
  })
}

export function groupStaffEdits(edits: readonly StaffEdit[]): { status: string; edits: StaffEdit[] }[] {
  const groups = new Map<string, StaffEdit[]>()
  for (const edit of edits) {
    const list = groups.get(edit.status) ?? []
    list.push(edit)
    groups.set(edit.status, list)
  }
  const known = new Set<string>(STAFF_STATUS_ORDER)
  const ordered = STAFF_STATUS_ORDER.filter((status) => groups.has(status)).map((status) => ({
    status,
    edits: groups.get(status) ?? [],
  }))
  const rest = Array.from(groups.keys())
    .filter((status) => !known.has(status))
    .sort((a, b) => a.localeCompare(b))
    .map((status) => ({ status, edits: groups.get(status) ?? [] }))
  return [...ordered, ...rest]
}

/** Sample board for local demo when Notion is not connected. Not used in production. */
export function sampleStaffEdits(now: Date = new Date()): StaffEdit[] {
  const page = (id: string) => notionPageUrl(id)
  return [
    {
      id: 'sample-queue',
      name: '1426 Cortlandt St',
      status: 'Not Started',
      clientName: 'Maya Chen',
      shotOn: null,
      dueLabel: null,
      completedOn: null,
      turnaroundDays: null,
      notionUrl: page('sample-queue'),
      lastEditedAt: null,
    },
    {
      id: 'sample-edit',
      name: '88 Yale St',
      status: 'Edit Started',
      clientName: 'Maya Chen',
      shotOn: '2026-11-02',
      dueLabel: '2026-11-16',
      completedOn: null,
      turnaroundDays: null,
      notionUrl: page('sample-edit'),
      lastEditedAt: null,
    },
    {
      id: 'sample-internal',
      name: '410 Heights Blvd',
      status: 'Internal Approval',
      clientName: 'Andre Walsh',
      shotOn: '2026-11-06',
      dueLabel: '2026-11-18',
      completedOn: null,
      turnaroundDays: null,
      notionUrl: page('sample-internal'),
      lastEditedAt: null,
    },
    {
      id: 'sample-revision',
      name: '12 Archive Ln',
      status: 'Revisions Needed',
      clientName: 'Maya Chen',
      shotOn: '2026-10-28',
      dueLabel: '2026-11-12',
      completedOn: null,
      turnaroundDays: null,
      notionUrl: page('sample-revision'),
      lastEditedAt: null,
    },
    {
      id: 'sample-done',
      name: '9 Winter St',
      status: 'Completed',
      clientName: 'Andre Walsh',
      shotOn: '2026-10-20',
      dueLabel: '2026-10-28',
      completedOn: '2026-10-27',
      turnaroundDays: 7,
      notionUrl: page('sample-done'),
      lastEditedAt: null,
    },
    {
      id: 'sample-approval',
      name: '22 Sample Ave',
      status: 'Sent for Approval',
      clientName: 'Maya Chen',
      shotOn: '2026-11-08',
      dueLabel: '2026-11-20',
      completedOn: null,
      turnaroundDays: null,
      notionUrl: page('sample-approval'),
      lastEditedAt: new Date(now.getTime() - 3 * 86_400_000).toISOString(),
    },
    {
      id: 'sample-approval-old',
      name: '4 Old Review Rd',
      status: 'Sent for Approval',
      clientName: 'Andre Walsh',
      shotOn: '2026-08-01',
      dueLabel: null,
      completedOn: null,
      turnaroundDays: null,
      notionUrl: page('sample-approval-old'),
      lastEditedAt: new Date(now.getTime() - 45 * 86_400_000).toISOString(),
    },
  ]
}
