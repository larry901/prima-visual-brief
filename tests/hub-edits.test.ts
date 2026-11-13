import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { filterStaffEdits, type StaffEdit } from '../lib/hub/edits'
import { staffEditFetchCache } from '../lib/portal/notion-edits'
import { snapshotFromNotionPage } from '../lib/portal/video-progress'

function edit(overrides: Partial<StaffEdit> & Pick<StaffEdit, 'id' | 'status'>): StaffEdit {
  return {
    name: 'Sample',
    clientName: 'Maya Chen',
    shotOn: null,
    dueLabel: null,
    completedOn: null,
    turnaroundDays: null,
    notionUrl: 'https://www.notion.so/sample',
    lastEditedAt: null,
    ...overrides,
  }
}

describe('staff edit refresh', () => {
  it('bypasses the Notion data cache when the board is refreshed', () => {
    assert.deepEqual(staffEditFetchCache(true), { cache: 'no-store' })
    assert.deepEqual(staffEditFetchCache(false), { next: { revalidate: 60 } })
  })
})

describe('sent for approval window', () => {
  it('keeps other statuses and drops Sent for Approval edited more than 30 Chicago days ago', () => {
    const visible = filterStaffEdits(
      [
        edit({ id: 'started', status: 'Edit Started', lastEditedAt: '2026-01-01T18:00:00.000Z' }),
        edit({ id: 'recent', status: 'Sent for Approval', lastEditedAt: '2026-11-01T18:00:00.000Z' }),
        edit({ id: 'edge', status: 'Sent for Approval', lastEditedAt: '2026-10-14T17:00:00.000Z' }),
        edit({ id: 'old', status: 'Sent for Approval', lastEditedAt: '2026-10-13T17:00:00.000Z' }),
        edit({ id: 'undated', status: 'Sent for Approval', lastEditedAt: null }),
      ],
      '2026-11-13',
    )
    assert.deepEqual(
      visible.map((row) => row.id),
      ['started', 'recent', 'edge'],
    )
  })

  it('reads Notion last_edited_time because the database has no status-changed date', () => {
    const page = snapshotFromNotionPage({
      object: 'page',
      id: '11111111-1111-4111-8111-111111111111',
      last_edited_time: '2026-11-10T15:04:00.000Z',
      properties: {
        'Video Name': { type: 'title', title: [{ plain_text: '22 Sample Ave' }] },
        Status: { type: 'status', status: { name: 'Sent for Approval' } },
        Client: { type: 'relation', relation: [] },
        'Date Shot': { type: 'date', date: null },
        'Client Due Date': { type: 'formula', formula: { type: 'date', date: null } },
        'Completed Date': { type: 'date', date: null },
      },
    })
    assert.equal(page?.lastEditedAt, '2026-11-10T15:04:00.000Z')
    assert.equal(page?.status, 'Sent for Approval')
  })
})
