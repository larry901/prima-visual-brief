import type { BriefRow } from '../db'
import { clientOwnsBrief } from '../brief-logic'
import { clientEmailAddresses } from '../portal/clients'
import { formatLongDate } from '../portal/cycle'
import { parseNotionPageId } from '../portal/notion-id'
import { parseLooseDate } from '../portal/video-progress'

export interface RosterClientRef {
  id: number
  email: string
  additionalEmails: string[]
  notionClientId: string | null
}

export interface BriefEditCandidate {
  id: string
  name: string
  clientIds: string[]
  shotOn: string | null
}

export interface HubBriefCard {
  id: number
  shootLabel: string
  title: string
  status: string
  edited: boolean
}

export type EditListState = 'ready' | 'unavailable' | 'off'

const DROPPED_TOKENS = new Set([
  'st',
  'street',
  'ave',
  'avenue',
  'rd',
  'road',
  'dr',
  'drive',
  'ln',
  'lane',
  'blvd',
  'boulevard',
  'ct',
  'court',
  'way',
  'pl',
  'place',
  'cir',
  'circle',
  'pkwy',
  'parkway',
  'trl',
  'trail',
  'hwy',
  'highway',
  'ter',
  'terrace',
  'tx',
  'texas',
  'usa',
  'unit',
  'apt',
  'apartment',
  'suite',
  'ste',
  'the',
])

const PLACEHOLDER_TITLES = new Set(['untitled', 'untitled video', 'new page', 'video'])
const ZIP_CODE = /^\d{5}$/
const STREET_NUMBER = /^(\d+)/

/** Compare a brief property with an Edit Video Name. Punctuation and street suffixes drop out. */
export function normalizePropertyTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token && !DROPPED_TOKENS.has(token) && !ZIP_CODE.test(token))
    .join(' ')
}

function meaningfulTitle(normalized: string): boolean {
  return Boolean(normalized) && !PLACEHOLDER_TITLES.has(normalized)
}

function streetNumber(normalized: string): string | null {
  const match = STREET_NUMBER.exec(normalized)
  return match ? match[1] : null
}

function nameTokens(normalized: string): string[] {
  return normalized.split(' ').filter((token) => token.length >= 3 && !/^\d+$/.test(token))
}

/** Same street number and street name, or one title contains the other. */
export function propertyTitlesSimilar(property: string, videoName: string): boolean {
  const left = normalizePropertyTitle(property)
  const right = normalizePropertyTitle(videoName)
  if (!meaningfulTitle(left) || !meaningfulTitle(right)) return false
  if (left === right || left.includes(right) || right.includes(left)) return true
  const leftNumber = streetNumber(left)
  const rightNumber = streetNumber(right)
  if (!leftNumber || leftNumber !== rightNumber) return false
  const leftWord = nameTokens(left)[0]
  const rightWord = nameTokens(right)[0]
  if (!leftWord || !rightWord) return false
  return leftWord === rightWord || leftWord.startsWith(rightWord) || rightWord.startsWith(leftWord)
}

/** True when both titles name a property and they are not the same one. */
export function propertyTitlesConflict(property: string, videoName: string): boolean {
  if (propertyTitlesSimilar(property, videoName)) return false
  const left = normalizePropertyTitle(property)
  const right = normalizePropertyTitle(videoName)
  if (!meaningfulTitle(left) || !meaningfulTitle(right)) return false
  const leftNumber = streetNumber(left)
  const rightNumber = streetNumber(right)
  if (leftNumber && rightNumber && leftNumber !== rightNumber) return true
  const leftTokens = nameTokens(left)
  const rightTokens = nameTokens(right)
  if (leftTokens.length === 0 || rightTokens.length === 0) return false
  return !leftTokens.some((token) => rightTokens.includes(token))
}

/**
 * One Edit page, or null when the match is not confident.
 * The roster client must be linked to a Notion Clients page. The edit's Client
 * relation has to include that page. Date Shot must be the brief's shoot day,
 * unless the edit has no Date Shot and its Video Name uniquely matches the property.
 * A different shoot day never matches. Two edits that both fit is not a match.
 */
export function matchBriefToEdit(
  brief: { shootDate: string | null; property: string | null; notionClientId: string | null },
  edits: readonly BriefEditCandidate[],
): string | null {
  const clientId = parseNotionPageId(brief.notionClientId)
  const day = parseLooseDate(brief.shootDate)
  if (!clientId || !day) return null
  const property = brief.property ?? ''
  const pool = edits.filter((edit) => edit.clientIds.some((id) => parseNotionPageId(id) === clientId))
  const sameDay = pool.filter((edit) => edit.shotOn === day)
  if (sameDay.length === 1) {
    return propertyTitlesConflict(property, sameDay[0].name) ? null : sameDay[0].id
  }
  if (sameDay.length > 1) {
    const similar = sameDay.filter((edit) => propertyTitlesSimilar(property, edit.name))
    return similar.length === 1 ? similar[0].id : null
  }
  const undated = pool.filter((edit) => !edit.shotOn && propertyTitlesSimilar(property, edit.name))
  return undated.length === 1 ? undated[0].id : null
}

/**
 * One roster client per brief. A stored client id wins when that client still exists.
 * Otherwise exactly one email match (primary or additional) is used. Names never match.
 * Zero matches, or more than one email match, stay unmatched.
 */
export function briefOwnerId(brief: Pick<BriefRow, 'client_id' | 'client_email' | 'client_name'>, clients: readonly RosterClientRef[]): number | null {
  if (brief.client_id != null && clients.some((client) => client.id === Number(brief.client_id))) {
    return Number(brief.client_id)
  }
  const matches = clients.filter((client) =>
    clientOwnsBrief(brief, {
      id: client.id,
      email: client.email,
      emails: clientEmailAddresses(client),
    }),
  )
  return matches.length === 1 ? matches[0].id : null
}

export function briefTitle(brief: Pick<BriefRow, 'property_address' | 'agent_name'>): string {
  const property = brief.property_address.trim()
  if (property) return property
  const agent = brief.agent_name.trim()
  if (agent) return agent
  return 'Untitled brief'
}

export function briefShootLabel(shootDate: string | null | undefined): string {
  const day = parseLooseDate(shootDate)
  return day ? formatLongDate(day) : 'No shoot date'
}

export function editListState(board: { configured: boolean; unavailable: boolean; usingSample: boolean }): EditListState {
  if (board.unavailable) return 'unavailable'
  if (board.configured || board.usingSample) return 'ready'
  return 'off'
}

export function briefEditStatus(
  pageId: string | null,
  edits: readonly { id: string; status: string }[],
  notion: EditListState,
): string {
  if (!pageId) return 'No edit linked'
  if (notion === 'unavailable') return 'Linked'
  const edit = edits.find((item) => item.id === pageId)
  if (edit?.status) return edit.status
  if (notion === 'off') return 'Linked'
  return 'Not in the edit list'
}

export function compareBriefsNewest(
  a: Pick<BriefRow, 'id' | 'shoot_date' | 'submitted_at'>,
  b: Pick<BriefRow, 'id' | 'shoot_date' | 'submitted_at'>,
): number {
  const aDay = parseLooseDate(a.shoot_date) ?? ''
  const bDay = parseLooseDate(b.shoot_date) ?? ''
  if (aDay !== bDay) {
    if (!aDay) return 1
    if (!bDay) return -1
    return aDay < bDay ? 1 : -1
  }
  const aTime = Date.parse(a.submitted_at)
  const bTime = Date.parse(b.submitted_at)
  const aMs = Number.isNaN(aTime) ? 0 : aTime
  const bMs = Number.isNaN(bTime) ? 0 : bTime
  if (aMs !== bMs) return bMs - aMs
  return b.id - a.id
}

export function groupBriefsForRoster(
  briefs: readonly BriefRow[],
  clients: readonly RosterClientRef[],
  edits: readonly { id: string; status: string }[],
  notion: EditListState,
): { byClient: Map<number, HubBriefCard[]>; unmatched: HubBriefCard[] } {
  const buckets = new Map<number, BriefRow[]>()
  const loose: BriefRow[] = []
  for (const brief of briefs) {
    const owner = briefOwnerId(brief, clients)
    if (owner == null) {
      loose.push(brief)
      continue
    }
    const list = buckets.get(owner) ?? []
    list.push(brief)
    buckets.set(owner, list)
  }
  const toCards = (rows: BriefRow[]): HubBriefCard[] =>
    [...rows].sort(compareBriefsNewest).map((brief) => ({
      id: brief.id,
      shootLabel: briefShootLabel(brief.shoot_date),
      title: briefTitle(brief),
      status: briefEditStatus(brief.notion_edit_page_id ?? null, edits, notion),
      edited: brief.edited_by_client === true,
    }))
  const byClient = new Map<number, HubBriefCard[]>()
  buckets.forEach((rows, id) => {
    byClient.set(id, toCards(rows))
  })
  return { byClient, unmatched: toCards(loose) }
}
