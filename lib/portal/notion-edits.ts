import type { PortalStore } from './types'
import {
  snapshotFromNotionPage,
  projectClientVideos,
  type NotionEditSnapshot,
  type VideoProgressItem,
} from './video-progress'
import { parseNotionPageId } from './notion-id'

/**
 * Prima Visual Edit database fa4c7d4a-3c59-4e20-9214-3ea5377b341a.
 * Queries use the data source id, which is what the current Notion API accepts.
 */
export const EDIT_DATA_SOURCE_ID = '8cb8185e-ac11-4a8d-a9e8-1ff7b2c8424d'

/** Notion Clients data source. The roster dropdown lists pages from here. */
export const CLIENTS_DATA_SOURCE_ID = '51796db7-df24-4fad-9998-206b98913abc'

export const NOTION_VERSION = '2026-03-11'

const CACHE_MS = 60_000
const PAGE_LIMIT = 5

export function notionConfigured(): boolean {
  return Boolean(process.env.NOTION_TOKEN?.trim())
}

export type NotionFetch = (
  input: string,
  init: RequestInit & { next?: { revalidate?: number } },
) => Promise<Response>

type CacheEntry = { expires: number; value: unknown }

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<unknown>>()

export function clearNotionCache(): void {
  cache.clear()
  inflight.clear()
}

function notionApiBase(): string {
  const raw = process.env.NOTION_API_BASE?.trim()
  if (!raw) return 'https://api.notion.com'
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'https://api.notion.com'
  } catch {
    return 'https://api.notion.com'
  }
  return raw.replace(/\/$/, '')
}

const defaultFetch: NotionFetch = (input, init) => fetch(input, init)

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.value as T
  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>
  const promise = load()
    .then((value) => {
      cache.set(key, { expires: Date.now() + CACHE_MS, value })
      return value
    })
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, promise)
  return promise
}

async function notionQuery(
  dataSourceId: string,
  body: Record<string, unknown>,
  fetchImpl: NotionFetch,
): Promise<unknown[]> {
  const token = process.env.NOTION_TOKEN?.trim()
  if (!token) throw new Error('Notion is not configured')
  const pages: unknown[] = []
  let cursor: string | undefined
  for (let page = 0; page < PAGE_LIMIT; page += 1) {
    const payload: Record<string, unknown> = { ...body, page_size: 100 }
    if (cursor) payload.start_cursor = cursor
    let response: Response
    try {
      response = await fetchImpl(`${notionApiBase()}/v1/data_sources/${dataSourceId}/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(8_000),
      })
    } catch {
      throw new Error('Notion request failed')
    }
    if (!response.ok) throw new Error(`Notion request failed (${response.status})`)
    const data = (await response.json()) as {
      results?: unknown[]
      has_more?: boolean
      next_cursor?: string | null
    }
    if (Array.isArray(data.results)) pages.push(...data.results)
    if (!data.has_more || !data.next_cursor) break
    cursor = data.next_cursor
  }
  return pages
}

async function queryEdits(clientPageId: string, fetchImpl: NotionFetch): Promise<NotionEditSnapshot[]> {
  const raw = await notionQuery(
    EDIT_DATA_SOURCE_ID,
    {
      filter: {
        property: 'Client',
        relation: { contains: clientPageId },
      },
    },
    fetchImpl,
  )
  const snapshots = raw
    .map((page) => snapshotFromNotionPage(page))
    .filter((page): page is NotionEditSnapshot => page != null && page.clientIds.includes(clientPageId))
  if (raw.length > 0 && snapshots.length === 0) {
    console.error('Video progress: Notion rows did not include this client')
  }
  return snapshots
}

function pageTitle(page: unknown): string {
  if (!page || typeof page !== 'object') return 'Untitled'
  const properties = (page as { properties?: unknown }).properties
  if (!properties || typeof properties !== 'object') return 'Untitled'
  for (const property of Object.values(properties as Record<string, unknown>)) {
    if (!property || typeof property !== 'object') continue
    if ((property as { type?: string }).type !== 'title') continue
    const title = (property as { title?: { plain_text?: string }[] }).title
    if (!Array.isArray(title)) continue
    const text = title.map((part) => (typeof part?.plain_text === 'string' ? part.plain_text : '')).join('').trim()
    if (text) return text
  }
  return 'Untitled'
}

async function queryClients(fetchImpl: NotionFetch): Promise<{ id: string; name: string }[]> {
  const raw = await notionQuery(CLIENTS_DATA_SOURCE_ID, {}, fetchImpl)
  const clients: { id: string; name: string }[] = []
  for (const page of raw) {
    if (!page || typeof page !== 'object') continue
    const record = page as { object?: string; archived?: boolean; in_trash?: boolean; id?: string }
    if (record.object !== 'page' || record.archived === true || record.in_trash === true) continue
    const id = parseNotionPageId(record.id)
    if (!id) continue
    clients.push({ id, name: pageTitle(page) })
  }
  clients.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id))
  return clients
}

export async function listNotionClients(fetchImpl?: NotionFetch): Promise<{ id: string; name: string }[]> {
  if (!notionConfigured()) return []
  if (fetchImpl) return queryClients(fetchImpl)
  return cached('notion-clients', () => queryClients(defaultFetch))
}

/**
 * Videos for one linked Notion client. Null hides the portal section:
 * no token, no linked page, or Notion could not be read.
 * A successful empty list is [] so the section can say nothing is in progress.
 */
export async function loadVideoProgress(
  store: Pick<PortalStore, 'listVideoStages' | 'saveVideoStages'>,
  client: { notionClientId: string | null },
  options: { now?: Date; fetchImpl?: NotionFetch } = {},
): Promise<VideoProgressItem[] | null> {
  const clientPageId = parseNotionPageId(client.notionClientId)
  if (!clientPageId || !notionConfigured()) return null
  try {
    const pages = options.fetchImpl
      ? await queryEdits(clientPageId, options.fetchImpl)
      : await cached(`edits:${clientPageId}`, () => queryEdits(clientPageId, defaultFetch))
    const stored = await store.listVideoStages(pages.map((page) => page.id))
    const projected = projectClientVideos({
      pages,
      stored,
      clientPageId,
      now: options.now,
    })
    if (projected.persist.length > 0) {
      try {
        await store.saveVideoStages(projected.persist)
      } catch (error) {
        console.error('Could not remember video stage', error instanceof Error ? error.message : 'error')
      }
    }
    return projected.videos
  } catch (error) {
    console.error('Video progress unavailable', error instanceof Error ? error.message : 'error')
    return null
  }
}
