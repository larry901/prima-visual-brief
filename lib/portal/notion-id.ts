const DASHED_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const COMPACT_ID = /[0-9a-f]{32}/i

function lastMatch(pattern: RegExp, value: string): string | null {
  const regex = new RegExp(pattern.source, 'gi')
  let found: string | null = null
  let match: RegExpExecArray | null
  while ((match = regex.exec(value)) !== null) {
    found = match[0]
    if (match[0].length === 0) break
  }
  return found
}

/**
 * Notion page ids are 32 hex characters. Staff paste either the id or a page URL
 * whose path ends in that id, with or without dashes.
 */
export function parseNotionPageId(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null
  let haystack = trimmed
  try {
    const url = new URL(trimmed)
    haystack = decodeURIComponent(`${url.pathname}${url.hash}`)
  } catch {
    haystack = trimmed
  }
  const dashed = lastMatch(DASHED_ID, haystack)
  if (dashed) return dashed.toLowerCase()
  const compact = lastMatch(COMPACT_ID, haystack)
  if (!compact) return null
  return hyphenateNotionId(compact)
}

export function hyphenateNotionId(hex: string): string {
  const id = hex.toLowerCase()
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`
}

/** Empty clears the link. Anything else must be a page id or a page URL. */
export function storedNotionClientId(value: string | null | undefined): string | null {
  if (value == null) return null
  if (!value.trim()) return null
  const id = parseNotionPageId(value)
  if (!id) throw new Error('Notion client must be a Notion page link or id')
  return id
}
