import type { BriefRow } from '../db'
import type { PortalStore } from '../portal/types'
import { matchBriefToEdit, briefOwnerId, type BriefEditCandidate, type RosterClientRef } from './brief-match'

type LinkStore = Pick<PortalStore, 'setBriefNotionLink'>

/**
 * Fill Edit links that are still empty. A staff choice, including a cleared link, is left alone.
 * `persist` is false for the local sample board so fictional page ids are not written down.
 */
export async function linkConfidentBriefs(
  store: LinkStore,
  briefs: readonly BriefRow[],
  clients: readonly RosterClientRef[],
  edits: readonly BriefEditCandidate[],
  options: { persist: boolean },
): Promise<BriefRow[]> {
  const clientsById = new Map(clients.map((client) => [client.id, client]))
  const linked: BriefRow[] = []
  for (const brief of briefs) {
    if (brief.notion_edit_page_id || brief.notion_edit_link === 'manual') {
      linked.push(brief)
      continue
    }
    const ownerId = briefOwnerId(brief, clients)
    const client = ownerId == null ? null : clientsById.get(ownerId) ?? null
    const pageId = matchBriefToEdit(
      {
        shootDate: brief.shoot_date,
        property: brief.property_address,
        notionClientId: client?.notionClientId ?? null,
      },
      edits,
    )
    if (!pageId) {
      linked.push(brief)
      continue
    }
    if (!options.persist) {
      linked.push({ ...brief, notion_edit_page_id: pageId, notion_edit_link: 'auto' })
      continue
    }
    try {
      linked.push(await store.setBriefNotionLink(brief.id, pageId, 'auto'))
    } catch (error) {
      console.error('Could not store a brief edit link', error instanceof Error ? error.message : 'error')
      linked.push(brief)
    }
  }
  return linked
}
