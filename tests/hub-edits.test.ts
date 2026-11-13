import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { clearNotionCache, loadStaffEditBoard } from '../lib/portal/notion-edits'

const originalFetch = globalThis.fetch
const originalToken = process.env.NOTION_TOKEN
const originalBase = process.env.NOTION_API_BASE

afterEach(() => {
  globalThis.fetch = originalFetch
  clearNotionCache()
  if (originalToken === undefined) delete process.env.NOTION_TOKEN
  else process.env.NOTION_TOKEN = originalToken
  if (originalBase === undefined) delete process.env.NOTION_API_BASE
  else process.env.NOTION_API_BASE = originalBase
})

describe('staff edit refresh', () => {
  it('serves a cached board, then bypasses that cache on refresh', async () => {
    process.env.NOTION_TOKEN = 'test-token'
    process.env.NOTION_API_BASE = 'https://notion.test'
    let calls = 0
    globalThis.fetch = async () => {
      calls += 1
      return new Response(JSON.stringify({ results: [], has_more: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    const first = await loadStaffEditBoard()
    const afterFirst = calls
    assert.ok(first)
    assert.equal(first.edits.length, 0)
    assert.ok(afterFirst > 0)
    const cached = await loadStaffEditBoard()
    assert.equal(calls, afterFirst)
    assert.equal(cached?.fetchedAt, first.fetchedAt)
    const fresh = await loadStaffEditBoard({ fresh: true })
    assert.ok(calls > afterFirst)
    assert.ok(fresh)
    assert.notEqual(fresh.fetchedAt, first.fetchedAt)
  })
})
