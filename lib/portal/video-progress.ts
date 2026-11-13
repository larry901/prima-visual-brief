import { chicagoToday, formatLongDate, isIsoDate } from './cycle'
import { parseNotionPageId } from './notion-id'

/** Client-facing stages, in indicator order. Internal Notion statuses never use these names. */
export const CLIENT_STAGES = [
  'In Queue',
  'Edit Started',
  'Ready for Approval',
  'Needs Revision',
  'Approved',
] as const

export type ClientStage = (typeof CLIENT_STAGES)[number]

/** Approved videos stay on the portal through this many Chicago calendar days, then drop off. */
export const APPROVED_VISIBLE_DAYS = 30

const DIRECT_STAGES = new Map<string, ClientStage>([
  ['not started', 'In Queue'],
  ['uploaded', 'In Queue'],
  ['edit started', 'Edit Started'],
  ['sent for approval', 'Ready for Approval'],
  ['client revision', 'Needs Revision'],
  ['completed', 'Approved'],
])

/**
 * These happen after editing has started, and they are never shown to a client.
 * Notion does not keep the previous status, so the last client-facing stage is stored instead.
 */
const INTERNAL_STAGES = new Set(['revisions needed', 'internal approval', 'ready to go'])

export function isClientStage(value: unknown): value is ClientStage {
  return typeof value === 'string' && (CLIENT_STAGES as readonly string[]).includes(value)
}

export function stageIndex(stage: ClientStage): number {
  return CLIENT_STAGES.indexOf(stage)
}

export function stageLinksToVideos(stage: ClientStage): boolean {
  return stage === 'Ready for Approval' || stage === 'Approved'
}

function statusKey(status: string): string {
  return status.trim().toLowerCase().replace(/\s+/g, ' ')
}

export interface StageResolution {
  stage: ClientStage | null
  /** Write this stage when it is new. Null leaves the stored stage alone. */
  persist: ClientStage | null
}

/**
 * Map a Notion status onto a client-facing stage.
 * A direct status updates what we remember. An internal status keeps the stored stage,
 * or Edit Started when nothing has been stored yet (those statuses only occur after editing starts).
 * A stored later stage such as Needs Revision is never replaced by that inference.
 */
export function resolveClientStage(
  notionStatus: string | null | undefined,
  stored: ClientStage | null,
): StageResolution {
  const key = statusKey(notionStatus ?? '')
  if (!key) return { stage: stored, persist: null }
  const direct = DIRECT_STAGES.get(key)
  if (direct) return { stage: direct, persist: stored === direct ? null : direct }
  if (INTERNAL_STAGES.has(key)) {
    if (stored) return { stage: stored, persist: null }
    return { stage: 'Edit Started', persist: 'Edit Started' }
  }
  if (stored) return { stage: stored, persist: null }
  return { stage: null, persist: null }
}

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
}

/** Pull a calendar date out of an ISO timestamp or a short written date. */
export function parseLooseDate(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const iso = trimmed.match(/\d{4}-\d{2}-\d{2}/)
  if (iso && isIsoDate(iso[0])) return iso[0]
  const numeric = trimmed.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (numeric) {
    const candidate = isoFromParts(Number(numeric[3]), Number(numeric[1]), Number(numeric[2]))
    if (candidate) return candidate
  }
  const named = trimmed.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})\b/i,
  )
  if (named) {
    const month = MONTHS[named[1].toLowerCase()]
    const candidate = isoFromParts(Number(named[3]), month, Number(named[2]))
    if (candidate) return candidate
  }
  return null
}

function isoFromParts(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return isIsoDate(iso) ? iso : null
}

export function calendarDaysBetween(earlier: string, later: string): number {
  const [y1, m1, d1] = earlier.split('-').map(Number)
  const [y2, m2, d2] = later.split('-').map(Number)
  const start = Date.UTC(y1, m1 - 1, d1)
  const end = Date.UTC(y2, m2 - 1, d2)
  return Math.round((end - start) / 86_400_000)
}

/** Keep an approved video when its completed date is missing or within the window. */
export function approvedStillVisible(completedOn: string | null, today: string): boolean {
  if (!completedOn || !isIsoDate(completedOn) || !isIsoDate(today)) return true
  return calendarDaysBetween(completedOn, today) <= APPROVED_VISIBLE_DAYS
}

export function progressDateLabel(iso: string | null): string | null {
  if (!iso || !isIsoDate(iso)) return null
  return formatLongDate(iso)
}

export function expectedDateLabel(dueOn: string | null, dueText: string | null): string | null {
  const formatted = progressDateLabel(dueOn)
  if (formatted) return formatted
  if (!dueText) return null
  const text = dueText.trim()
  if (!text || text.length > 80 || /[\r\n]/.test(text)) return null
  if (/^(null|undefined|nan)$/i.test(text)) return null
  return text
}

export interface NotionEditSnapshot {
  id: string
  name: string
  status: string | null
  clientIds: string[]
  shotOn: string | null
  dueOn: string | null
  dueText: string | null
  completedOn: string | null
  /** Notion page last_edited_time. The database has no status-changed property. */
  lastEditedAt: string | null
}

export interface VideoProgressItem {
  name: string
  stage: ClientStage
  shotLabel: string | null
  expectedLabel: string | null
}

export interface ProjectedVideos {
  videos: VideoProgressItem[]
  persist: { pageId: string; stage: ClientStage }[]
}

interface SortableVideo extends VideoProgressItem {
  shotOn: string | null
  pageId: string
}

export function projectClientVideos(args: {
  pages: NotionEditSnapshot[]
  stored: ReadonlyMap<string, ClientStage>
  clientPageId: string
  now?: Date
}): ProjectedVideos {
  const clientPageId = parseNotionPageId(args.clientPageId)
  if (!clientPageId) return { videos: [], persist: [] }
  const today = chicagoToday(args.now ?? new Date())
  const persist: { pageId: string; stage: ClientStage }[] = []
  const sortable: SortableVideo[] = []

  for (const page of args.pages) {
    const pageId = parseNotionPageId(page.id)
    if (!pageId) continue
    if (!page.clientIds.some((id) => parseNotionPageId(id) === clientPageId)) continue
    const stored = args.stored.get(pageId) ?? null
    const resolved = resolveClientStage(page.status, stored)
    if (!resolved.stage) continue
    if (resolved.stage === 'Approved' && !approvedStillVisible(page.completedOn, today)) continue
    if (resolved.persist) persist.push({ pageId, stage: resolved.persist })
    sortable.push({
      pageId,
      name: page.name.trim() || 'Untitled video',
      stage: resolved.stage,
      shotOn: page.shotOn,
      shotLabel: progressDateLabel(page.shotOn),
      expectedLabel: expectedDateLabel(page.dueOn, page.dueText),
    })
  }

  sortable.sort((a, b) => {
    const aApproved = a.stage === 'Approved' ? 1 : 0
    const bApproved = b.stage === 'Approved' ? 1 : 0
    if (aApproved !== bApproved) return aApproved - bApproved
    if (a.shotOn && b.shotOn && a.shotOn !== b.shotOn) return a.shotOn < b.shotOn ? 1 : -1
    if (a.shotOn && !b.shotOn) return -1
    if (!a.shotOn && b.shotOn) return 1
    return a.name.localeCompare(b.name)
  })

  return {
    videos: sortable.map(({ name, stage, shotLabel, expectedLabel }) => ({
      name,
      stage,
      shotLabel,
      expectedLabel,
    })),
    persist,
  }
}

function plainText(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      const text = (part as { plain_text?: unknown }).plain_text
      return typeof text === 'string' ? text : ''
    })
    .join('')
    .trim()
}

function readStatusName(property: unknown): string | null {
  if (!property || typeof property !== 'object') return null
  const record = property as {
    status?: { name?: string } | null
    select?: { name?: string } | null
  }
  const name = record.status?.name ?? record.select?.name
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  return trimmed || null
}

function readRelationIds(property: unknown): string[] {
  if (!property || typeof property !== 'object') return []
  const relation = (property as { relation?: unknown }).relation
  if (!Array.isArray(relation)) return []
  const ids: string[] = []
  for (const entry of relation) {
    if (!entry || typeof entry !== 'object') continue
    const id = parseNotionPageId((entry as { id?: unknown }).id as string | null | undefined)
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

function readDateStart(property: unknown): string | null {
  if (!property || typeof property !== 'object') return null
  const date = (property as { date?: unknown }).date
  if (!date || typeof date !== 'object') return null
  const start = (date as { start?: unknown }).start
  return typeof start === 'string' ? parseLooseDate(start) : null
}

function readDue(property: unknown): { dueOn: string | null; dueText: string | null } {
  if (!property || typeof property !== 'object') return { dueOn: null, dueText: null }
  const formula = (property as { formula?: unknown }).formula
  if (!formula || typeof formula !== 'object') return { dueOn: null, dueText: null }
  const typed = formula as {
    type?: string
    date?: { start?: string } | null
    string?: string | null
  }
  if (typed.type === 'date') {
    const start = typed.date && typeof typed.date.start === 'string' ? typed.date.start : ''
    return { dueOn: parseLooseDate(start), dueText: null }
  }
  if (typed.type === 'string' && typeof typed.string === 'string') {
    const text = typed.string.trim()
    if (!text) return { dueOn: null, dueText: null }
    const dueOn = parseLooseDate(text)
    return { dueOn, dueText: dueOn ? null : text }
  }
  return { dueOn: null, dueText: null }
}

/** Read the Prima Visual Edit properties we show. Returns null when the payload is not a page. */
export function snapshotFromNotionPage(page: unknown): NotionEditSnapshot | null {
  if (!page || typeof page !== 'object') return null
  const record = page as Record<string, unknown>
  if (record.object !== 'page') return null
  if (record.archived === true || record.in_trash === true) return null
  const id = parseNotionPageId(typeof record.id === 'string' ? record.id : '')
  if (!id) return null
  const properties =
    record.properties && typeof record.properties === 'object'
      ? (record.properties as Record<string, unknown>)
      : {}
  const title = plainText((properties['Video Name'] as { title?: unknown } | undefined)?.title)
  return {
    id,
    name: title || 'Untitled video',
    status: readStatusName(properties.Status),
    clientIds: readRelationIds(properties.Client),
    shotOn: readDateStart(properties['Date Shot']),
    ...readDue(properties['Client Due Date']),
    completedOn: readDateStart(properties['Completed Date']),
    lastEditedAt: readInstant(record.last_edited_time),
  }
}

function readInstant(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}
