import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseClientInput } from '../lib/portal/clients'
import { MemoryStore } from '../lib/portal/memory-store'
import {
  CLIENTS_DATA_SOURCE_ID,
  EDIT_DATA_SOURCE_ID,
  NOTION_VERSION,
  clearNotionCache,
  listNotionClients,
  loadVideoProgress,
  type NotionFetch,
} from '../lib/portal/notion-edits'
import { parseNotionPageId } from '../lib/portal/notion-id'
import type { ClientInput } from '../lib/portal/types'
import {
  approvedStillVisible,
  projectClientVideos,
  resolveClientStage,
  snapshotFromNotionPage,
  type ClientStage,
  type NotionEditSnapshot,
} from '../lib/portal/video-progress'

const NOW = new Date('2026-11-12T18:00:00.000Z')
const CLIENT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const PAGE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'

const DIRECT: [string, ClientStage][] = [
  ['Not Started', 'In Queue'],
  ['Uploaded', 'In Queue'],
  ['Edit Started', 'Edit Started'],
  ['Sent for Approval', 'Ready for Approval'],
  ['Client Revision', 'Needs Revision'],
  ['Completed', 'Approved'],
]

function clientInput(overrides: Partial<ClientInput> = {}): ClientInput {
  return {
    name: 'Casey Example',
    email: 'casey.example@example.com',
    company: 'Example Realty',
    kind: 'subscription',
    planSize: 2,
    renewalDate: '2026-12-01',
    schedulingLink: null,
    frameioUrl: null,
    active: true,
    ...overrides,
  }
}

function snap(overrides: Partial<NotionEditSnapshot> = {}): NotionEditSnapshot {
  return {
    id: PAGE,
    name: '410 Oak Street',
    status: 'Edit Started',
    clientIds: [CLIENT],
    shotOn: '2026-11-02',
    dueOn: '2026-11-16',
    dueText: null,
    completedOn: null,
    lastEditedAt: null,
    ...overrides,
  }
}

function notionPage(overrides: {
  id?: string
  name?: string
  status?: string | null
  clients?: string[]
  shot?: string | null
  due?: unknown
  completed?: string | null
  archived?: boolean
}) {
  return {
    object: 'page',
    id: overrides.id ?? PAGE,
    archived: overrides.archived ?? false,
    properties: {
      'Video Name': { type: 'title', title: [{ plain_text: overrides.name ?? '410 Oak Street' }] },
      Status: { type: 'status', status: overrides.status ? { name: overrides.status } : null },
      Client: {
        type: 'relation',
        relation: (overrides.clients ?? [CLIENT]).map((id) => ({ id })),
        has_more: false,
      },
      'Date Shot': { type: 'date', date: overrides.shot ? { start: overrides.shot } : null },
      'Client Due Date':
        overrides.due ?? { type: 'formula', formula: { type: 'date', date: { start: '2026-11-16' } } },
      'Completed Date': {
        type: 'date',
        date: overrides.completed ? { start: overrides.completed } : null,
      },
    },
  }
}

async function withNotionEnv(token: string | undefined, run: () => Promise<void>) {
  const previousToken = process.env.NOTION_TOKEN
  const previousBase = process.env.NOTION_API_BASE
  if (token === undefined) delete process.env.NOTION_TOKEN
  else process.env.NOTION_TOKEN = token
  process.env.NOTION_API_BASE = 'http://notion.test'
  clearNotionCache()
  try {
    await run()
  } finally {
    if (previousToken === undefined) delete process.env.NOTION_TOKEN
    else process.env.NOTION_TOKEN = previousToken
    if (previousBase === undefined) delete process.env.NOTION_API_BASE
    else process.env.NOTION_API_BASE = previousBase
    clearNotionCache()
  }
}

describe('client-facing video stages', () => {
  it('maps each client-visible Notion status and hides internal names', () => {
    for (const [status, stage] of DIRECT) {
      const resolved = resolveClientStage(status, null)
      assert.equal(resolved.stage, stage)
      assert.equal(resolved.persist, stage)
      assert.equal(JSON.stringify(resolved).includes(status), status === stage)
    }
    assert.equal(resolveClientStage('  COMPLETED  ', null).stage, 'Approved')
    assert.equal(resolveClientStage('edit   started', 'In Queue').stage, 'Edit Started')
  })

  it('keeps the last client-visible stage across internal statuses', async () => {
    const store = new MemoryStore()
    const sequence: { status: string; expect: ClientStage; completedOn?: string }[] = [
      { status: 'Not Started', expect: 'In Queue' },
      { status: 'Revisions Needed', expect: 'In Queue' },
      { status: 'Edit Started', expect: 'Edit Started' },
      { status: 'Internal Approval', expect: 'Edit Started' },
      { status: 'Sent for Approval', expect: 'Ready for Approval' },
      { status: 'Ready to Go', expect: 'Ready for Approval' },
      { status: 'Client Revision', expect: 'Needs Revision' },
      { status: 'Revisions Needed', expect: 'Needs Revision' },
      { status: 'Completed', expect: 'Approved', completedOn: '2026-11-01' },
      { status: 'Internal Approval', expect: 'Approved', completedOn: '2026-11-01' },
    ]

    for (const step of sequence) {
      const stored = await store.listVideoStages([PAGE])
      const projected = projectClientVideos({
        pages: [snap({ status: step.status, completedOn: step.completedOn ?? null })],
        stored,
        clientPageId: CLIENT,
        now: NOW,
      })
      assert.equal(projected.videos.length, 1, step.status)
      assert.equal(projected.videos[0].stage, step.expect, step.status)
      const rendered = JSON.stringify(projected.videos)
      assert.equal(rendered.includes('Revisions Needed'), false)
      assert.equal(rendered.includes('Internal Approval'), false)
      assert.equal(rendered.includes('Ready to Go'), false)
      assert.equal(rendered.includes('Sent for Approval'), false)
      assert.equal(rendered.includes('Client Revision'), false)
      await store.saveVideoStages(projected.persist)
    }

    const fresh = projectClientVideos({
      pages: [snap({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', status: 'Ready to Go', name: '88 River Road' })],
      stored: new Map(),
      clientPageId: CLIENT,
      now: NOW,
    })
    assert.equal(fresh.videos[0].stage, 'Edit Started')
    assert.deepEqual(fresh.persist, [{ pageId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', stage: 'Edit Started' }])

    const kept = projectClientVideos({
      pages: [snap({ status: 'Revisions Needed' })],
      stored: new Map([[PAGE, 'Needs Revision']]),
      clientPageId: CLIENT,
      now: NOW,
    })
    assert.equal(kept.videos[0].stage, 'Needs Revision')
    assert.deepEqual(kept.persist, [])
  })

  it('drops another client’s videos and approved videos older than 30 days', () => {
    const projected = projectClientVideos({
      pages: [
        snap({ name: '410 Oak Street', status: 'Uploaded', shotOn: '2026-11-02' }),
        snap({
          id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
          name: 'Other client listing',
          status: 'Completed',
          clientIds: [OTHER],
          shotOn: '2026-11-08',
        }),
        snap({
          id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4',
          name: 'Recent approval',
          status: 'Completed',
          shotOn: '2026-10-20',
          completedOn: '2026-10-13',
        }),
        snap({
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5',
          name: 'Old approval',
          status: 'Completed',
          shotOn: '2026-09-01',
          completedOn: '2026-10-12',
        }),
        snap({
          id: 'ffffffff-ffff-4fff-8fff-fffffffffff6',
          name: 'Undated approval',
          status: 'Completed',
          shotOn: null,
          completedOn: null,
          dueOn: null,
        }),
      ],
      stored: new Map(),
      clientPageId: CLIENT,
      now: NOW,
    })
    assert.deepEqual(
      projected.videos.map((video) => video.name),
      ['410 Oak Street', 'Recent approval', 'Undated approval'],
    )
    assert.equal(approvedStillVisible('2026-10-13', '2026-11-12'), true)
    assert.equal(approvedStillVisible('2026-10-12', '2026-11-12'), false)
    assert.equal(projected.videos[0].shotLabel, 'November 2, 2026')
    assert.equal(projected.videos[0].expectedLabel, 'November 16, 2026')
  })

  it('reads formula dates and strings, and ignores a video with an unknown status', () => {
    const dated = snapshotFromNotionPage(notionPage({ status: 'Uploaded' }))
    assert.equal(dated?.dueOn, '2026-11-16')
    assert.equal(dated?.shotOn, null)

    const written = snapshotFromNotionPage(
      notionPage({
        status: 'Edit Started',
        shot: '2026-10-28T15:00:00.000-05:00',
        due: { type: 'formula', formula: { type: 'string', string: 'November 20, 2026' } },
      }),
    )
    assert.ok(written)
    const projected = projectClientVideos({
      pages: [
        written,
        snap({ id: '99999999-9999-4999-8999-999999999999', name: 'Mystery', status: 'Secret Internal', clientIds: [CLIENT] }),
      ],
      stored: new Map(),
      clientPageId: `https://www.notion.so/Harbor-${CLIENT.replace(/-/g, '')}?pvs=21`,
      now: NOW,
    })
    assert.equal(projected.videos.length, 1)
    assert.equal(projected.videos[0].name, '410 Oak Street')
    assert.equal(projected.videos[0].shotLabel, 'October 28, 2026')
    assert.equal(projected.videos[0].expectedLabel, 'November 20, 2026')

    const loose = snapshotFromNotionPage(
      notionPage({
        due: { type: 'formula', formula: { type: 'string', string: 'About two weeks' } },
      }),
    )
    assert.equal(loose?.dueText, 'About two weeks')
    assert.equal(snapshotFromNotionPage(notionPage({ archived: true })), null)
  })
})

describe('Notion client page ids', () => {
  it('accepts a pasted page URL or id and rejects anything else', () => {
    const compact = CLIENT.replace(/-/g, '')
    assert.equal(parseNotionPageId(`https://www.notion.so/Harbor-Co-${compact}?pvs=21`), CLIENT)
    assert.equal(parseNotionPageId(`https://www.notion.so/${CLIENT}`), CLIENT)
    assert.equal(parseNotionPageId(compact), CLIENT)
    assert.equal(parseNotionPageId(CLIENT), CLIENT)
    assert.equal(
      parseNotionPageId(`https://www.notion.so/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/${compact}`),
      CLIENT,
    )
    assert.equal(parseNotionPageId(''), null)
    assert.equal(parseNotionPageId('https://example.com/schedule/maya'), null)

    const parsed = parseClientInput({ ...clientInput(), notionClient: `https://www.notion.so/${compact}` })
    assert.equal(parsed.ok, true)
    if (parsed.ok) assert.equal(parsed.value.notionClientId, CLIENT)

    const invalid = parseClientInput({ ...clientInput(), notionClient: 'not a page' })
    assert.equal(invalid.ok, false)
    if (!invalid.ok) assert.equal(invalid.error, 'Notion client must be a Notion page link or id')

    const omitted = parseClientInput(clientInput())
    assert.equal(omitted.ok, true)
    if (omitted.ok) assert.equal(omitted.value.notionClientId, undefined)
  })

  it('keeps a stored Notion client when an update omits the field', async () => {
    const store = new MemoryStore()
    const created = await store.createClient(clientInput({ notionClientId: `https://www.notion.so/${CLIENT}` }))
    assert.equal(created.notionClientId, CLIENT)
    const preserved = await store.updateClient(created.id, clientInput())
    assert.equal(preserved.notionClientId, CLIENT)
    const cleared = await store.updateClient(created.id, clientInput({ notionClientId: '' }))
    assert.equal(cleared.notionClientId, null)
  })
})

describe('Notion video loading', () => {
  it('shows only this client and remembers the stage when Notion moves to an internal status', async () => {
    const store = new MemoryStore()
    await store.createClient(clientInput({ notionClientId: CLIENT }))
    let status = 'Uploaded'
    let calls = 0
    const fetchImpl: NotionFetch = async (url, init) => {
      calls += 1
      const body = JSON.parse(String(init.body))
      assert.equal(String(url), `http://notion.test/v1/data_sources/${EDIT_DATA_SOURCE_ID}/query`)
      assert.equal(body.filter.property, 'Client')
      assert.equal(body.filter.relation.contains, CLIENT)
      const headers = new Headers(init.headers)
      assert.equal(headers.get('authorization'), 'Bearer test-notion-token')
      assert.equal(headers.get('notion-version'), NOTION_VERSION)
      return Response.json({
        results: [
          notionPage({ status, name: '410 Oak Street' }),
          notionPage({
            id: '22222222-2222-4222-8222-222222222223',
            name: 'Someone else',
            status: 'Completed',
            clients: [OTHER],
          }),
        ],
        has_more: false,
      })
    }

    await withNotionEnv('test-notion-token', async () => {
      const first = await loadVideoProgress(store, { notionClientId: CLIENT }, { now: NOW, fetchImpl })
      assert.deepEqual(first?.map((video) => [video.name, video.stage]), [['410 Oak Street', 'In Queue']])
      status = 'Revisions Needed'
      const second = await loadVideoProgress(store, { notionClientId: CLIENT }, { now: NOW, fetchImpl })
      assert.equal(second?.[0].stage, 'In Queue')
      const remembered = await store.listVideoStages([PAGE])
      assert.equal(remembered.get(PAGE), 'In Queue')
      assert.equal(calls, 2)
    })
  })

  it('hides the section when the token is missing or Notion fails', async () => {
    const store = new MemoryStore()
    let called = false
    const fetchImpl: NotionFetch = async () => {
      called = true
      return Response.json({ results: [], has_more: false })
    }
    await withNotionEnv(undefined, async () => {
      const hidden = await loadVideoProgress(store, { notionClientId: CLIENT }, { fetchImpl })
      assert.equal(hidden, null)
      assert.equal(called, false)
    })
    await withNotionEnv('test-notion-token', async () => {
      const unlinked = await loadVideoProgress(store, { notionClientId: null }, { fetchImpl })
      assert.equal(unlinked, null)
      const failed = await loadVideoProgress(
        store,
        { notionClientId: CLIENT },
        {
          fetchImpl: async () => new Response('nope', { status: 500 }),
        },
      )
      assert.equal(failed, null)
      const empty = await loadVideoProgress(
        store,
        { notionClientId: CLIENT },
        { fetchImpl: async () => Response.json({ results: [], has_more: false }) },
      )
      assert.deepEqual(empty, [])
    })
  })

  it('lists Notion client pages for the roster dropdown', async () => {
    const fetchImpl: NotionFetch = async (url) => {
      assert.equal(String(url), `http://notion.test/v1/data_sources/${CLIENTS_DATA_SOURCE_ID}/query`)
      return Response.json({
        results: [
          {
            object: 'page',
            id: OTHER,
            properties: { Name: { type: 'title', title: [{ plain_text: 'Walsh Group' }] } },
          },
          {
            object: 'page',
            id: CLIENT.replace(/-/g, ''),
            properties: { Client: { type: 'title', title: [{ plain_text: 'Harbor & Co Realty' }] } },
          },
          { object: 'page', id: PAGE, archived: true, properties: {} },
        ],
        has_more: false,
      })
    }
    await withNotionEnv('test-notion-token', async () => {
      const clients = await listNotionClients(fetchImpl)
      assert.deepEqual(clients, [
        { id: CLIENT, name: 'Harbor & Co Realty' },
        { id: OTHER, name: 'Walsh Group' },
      ])
    })
  })
})
