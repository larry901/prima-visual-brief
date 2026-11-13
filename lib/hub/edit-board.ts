import { demoSeedEnabled } from '../portal/seed'
import { loadStaffEditBoard, notionConfigured } from '../portal/notion-edits'
import { sampleStaffEdits, type HubEditBoard } from './edits'

export type { HubEditBoard }

/** Staff edit list. `fresh` skips the one-minute Notion cache. */
export async function loadHubEditBoard(options: { fresh?: boolean } = {}): Promise<HubEditBoard> {
  const fetchedAt = new Date().toISOString()
  const configured = notionConfigured()
  if (!configured) {
    const usingSample = demoSeedEnabled()
    return {
      configured: false,
      unavailable: false,
      usingSample,
      edits: usingSample ? sampleStaffEdits() : [],
      fetchedAt,
    }
  }
  const edits = await loadStaffEditBoard(undefined, { fresh: options.fresh === true })
  return {
    configured: true,
    unavailable: edits == null,
    usingSample: false,
    edits: edits ?? [],
    fetchedAt,
  }
}
