import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { staffEditFetchCache } from '../lib/portal/notion-edits'

describe('staff edit refresh', () => {
  it('bypasses the Notion data cache when the board is refreshed', () => {
    assert.deepEqual(staffEditFetchCache(true), { cache: 'no-store' })
    assert.deepEqual(staffEditFetchCache(false), { next: { revalidate: 60 } })
  })
})
