import { isIsoDate } from '../portal/cycle'
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
  }
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
export function sampleStaffEdits(): StaffEdit[] {
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
    },
  ]
}
