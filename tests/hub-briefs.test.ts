import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { BriefRow } from '../lib/db'
import { linkConfidentBriefs } from '../lib/hub/brief-links'
import {
  briefEditStatus,
  briefOwnerId,
  compareBriefsNewest,
  groupBriefsForRoster,
  matchBriefToEdit,
  propertyTitlesConflict,
  propertyTitlesSimilar,
  type BriefEditCandidate,
  type RosterClientRef,
} from '../lib/hub/brief-match'
import { emptyMemoryData, MemoryStore } from '../lib/portal/memory-store'

const MAYA_PAGE = '11111111-1111-4111-8111-111111111111'
const ANDRE_PAGE = '22222222-2222-4222-8222-222222222222'
const CORTLANDT = '33333333-3333-4333-8333-333333333333'
const YALE = '44444444-4444-4444-8444-444444444444'
const CREATIVE = '55555555-5555-4555-8555-555555555555'
const INFO = '66666666-6666-4666-8666-666666666666'

const maya: RosterClientRef = {
  id: 1,
  email: 'maya.chen@example.com',
  additionalEmails: ['sam.example@example.com'],
  notionClientId: MAYA_PAGE,
}
const andre: RosterClientRef = {
  id: 2,
  email: 'andre.walsh@example.com',
  additionalEmails: [],
  notionClientId: ANDRE_PAGE,
}
const unlinked: RosterClientRef = {
  id: 3,
  email: 'priya.nair@example.com',
  additionalEmails: [],
  notionClientId: null,
}

function edit(overrides: Partial<BriefEditCandidate> & Pick<BriefEditCandidate, 'id' | 'name'>): BriefEditCandidate {
  return {
    clientIds: [MAYA_PAGE],
    shotOn: '2026-11-18',
    ...overrides,
  }
}

function brief(overrides: Partial<BriefRow> = {}): BriefRow {
  return {
    id: 1,
    client_name: 'maya.chen@example.com',
    agent_name: 'Maya Chen',
    property_address: '1426 Cortlandt St, Houston, TX 77008',
    shoot_date: '2026-11-18',
    agent_on_site: 'Yes',
    gate_code: null,
    lockbox_code: null,
    access_notes: null,
    video_types: '[]',
    video_details: '{}',
    drive_link: null,
    asset_notes: null,
    file_paths: '[]',
    submitted_at: '2026-11-01T15:00:00.000Z',
    client_id: 1,
    client_email: 'maya.chen@example.com',
    updated_at: null,
    edited_by_client: false,
    previous_snapshot: null,
    edit_token_hash: null,
    notion_edit_page_id: null,
    notion_edit_link: null,
    ...overrides,
  }
}

describe('brief to roster client', () => {
  const clients = [maya, andre, unlinked]

  it('uses the stored client id, then a single email, and ignores a shared name', () => {
    assert.equal(briefOwnerId(brief({ client_id: 1, client_email: 'andre.walsh@example.com' }), clients), 1)
    assert.equal(briefOwnerId(brief({ client_id: null, client_email: 'Sam.Example@example.com' }), clients), 1)
    assert.equal(briefOwnerId(brief({ client_id: null, client_name: 'andre.walsh@example.com', client_email: null }), clients), 2)
    assert.equal(
      briefOwnerId(
        brief({
          client_id: null,
          client_email: 'jordan.guest@example.com',
          client_name: 'Jordan Guest',
          agent_name: 'Maya Chen',
        }),
        clients,
      ),
      null,
    )
    assert.equal(
      briefOwnerId(
        brief({ client_id: 99, client_email: 'andre.walsh@example.com', client_name: 'andre.walsh@example.com' }),
        clients,
      ),
      2,
    )
  })

  it('leaves a brief unmatched when the email is on more than one client', () => {
    const twins: RosterClientRef[] = [
      { ...maya, additionalEmails: [] },
      { ...andre, id: 4, email: 'maya.chen@example.com' },
    ]
    assert.equal(briefOwnerId(brief({ client_id: null, client_email: 'maya.chen@example.com' }), twins), null)
  })

  it('sorts by shoot date, newest first, and puts an undated brief last', () => {
    const rows = [
      brief({ id: 1, shoot_date: '2026-10-01', submitted_at: '2026-11-02T00:00:00.000Z' }),
      brief({ id: 2, shoot_date: '2026-11-18', submitted_at: '2026-11-01T00:00:00.000Z' }),
      brief({ id: 3, shoot_date: '2026-11-18', submitted_at: '2026-11-03T00:00:00.000Z' }),
      brief({ id: 4, shoot_date: '', submitted_at: '2026-12-01T00:00:00.000Z' }),
    ].sort(compareBriefsNewest)
    assert.deepEqual(rows.map((row) => row.id), [3, 2, 1, 4])
  })
})

describe('brief to Notion edit', () => {
  it('treats a street suffix and city as the same property, and a different number as a conflict', () => {
    assert.equal(propertyTitlesSimilar('1426 Cortlandt St, Houston, TX 77008', '1426 Cortlandt St'), true)
    assert.equal(propertyTitlesSimilar('1426 Cortlandt St', '1426 Cortlandt — Creative'), true)
    assert.equal(propertyTitlesConflict('1426 Cortlandt St', '88 Yale St'), true)
    assert.equal(propertyTitlesConflict('Smith Residence', '1426 Cortlandt St'), true)
    assert.equal(propertyTitlesConflict('1426 Cortlandt St', 'Untitled video'), false)
  })

  it('links the one edit on that shoot date for the client page', () => {
    const pageId = matchBriefToEdit(
      { shootDate: '2026-11-18', property: '1426 Cortlandt St, Houston, TX 77008', notionClientId: MAYA_PAGE },
      [
        edit({ id: CORTLANDT, name: '1426 Cortlandt St' }),
        edit({ id: YALE, name: '88 Yale St', shotOn: '2026-11-02' }),
        edit({ id: 'other-client', name: '1426 Cortlandt St', clientIds: [ANDRE_PAGE] }),
      ],
    )
    assert.equal(pageId, CORTLANDT)
  })

  it('uses the title to pick between two edits shot the same day', () => {
    const edits = [
      edit({ id: CREATIVE, name: '1426 Cortlandt Creative' }),
      edit({ id: INFO, name: '88 Yale St' }),
    ]
    assert.equal(
      matchBriefToEdit(
        { shootDate: '2026-11-18', property: '1426 Cortlandt St', notionClientId: `https://www.notion.so/${MAYA_PAGE.replace(/-/g, '')}` },
        edits,
      ),
      CREATIVE,
    )
  })

  it('stays unlinked when two same-day edits share the property', () => {
    assert.equal(
      matchBriefToEdit(
        { shootDate: '2026-11-18', property: '1426 Cortlandt St', notionClientId: MAYA_PAGE },
        [edit({ id: CREATIVE, name: '1426 Cortlandt Creative' }), edit({ id: INFO, name: '1426 Cortlandt Informative' })],
      ),
      null,
    )
  })

  it('does not link a different shoot day, a missing client page, or a missing shoot date', () => {
    const edits = [edit({ id: CORTLANDT, name: '1426 Cortlandt St', shotOn: '2026-11-02' })]
    assert.equal(
      matchBriefToEdit({ shootDate: '2026-11-18', property: '1426 Cortlandt St', notionClientId: MAYA_PAGE }, edits),
      null,
    )
    assert.equal(
      matchBriefToEdit({ shootDate: '2026-11-18', property: '1426 Cortlandt St', notionClientId: null }, [
        edit({ id: CORTLANDT, name: '1426 Cortlandt St' }),
      ]),
      null,
    )
    assert.equal(
      matchBriefToEdit({ shootDate: '', property: '1426 Cortlandt St', notionClientId: MAYA_PAGE }, [
        edit({ id: CORTLANDT, name: '1426 Cortlandt St', shotOn: null }),
      ]),
      null,
    )
  })

  it('links an undated edit when the title is unique for that client', () => {
    assert.equal(
      matchBriefToEdit(
        { shootDate: '2026-11-18', property: '1426 Cortlandt St', notionClientId: MAYA_PAGE },
        [edit({ id: CORTLANDT, name: '1426 Cortlandt St', shotOn: null }), edit({ id: YALE, name: '88 Yale St', shotOn: '2026-10-01' })],
      ),
      CORTLANDT,
    )
  })

  it('refuses the one same-day edit when the title names a different property', () => {
    assert.equal(
      matchBriefToEdit(
        { shootDate: '2026-11-18', property: '1426 Cortlandt St', notionClientId: MAYA_PAGE },
        [edit({ id: YALE, name: '88 Yale St' })],
      ),
      null,
    )
  })
})

describe('stored edit links', () => {
  it('saves an automatic link once and keeps a manual choice, including a cleared one', async () => {
    const store = new MemoryStore(emptyMemoryData())
    const created = await store.createBriefRecord({
      client_name: 'maya.chen@example.com',
      client_email: 'maya.chen@example.com',
      client_id: 1,
      agent_name: 'Maya Chen',
      property_address: '1426 Cortlandt St',
      shoot_date: '2026-11-18',
      agent_on_site: 'Yes',
      gate_code: null,
      lockbox_code: null,
      access_notes: null,
      video_types: '[]',
      video_details: '{}',
      drive_link: null,
      asset_notes: null,
      file_paths: '[]',
      edit_token_hash: null,
    })
    const edits = [edit({ id: CORTLANDT, name: '1426 Cortlandt St' })]
    const first = await linkConfidentBriefs(store, [created], [maya], edits, { persist: true })
    assert.equal(first[0]?.notion_edit_page_id, CORTLANDT)
    assert.equal(first[0]?.notion_edit_link, 'auto')

    await store.setBriefNotionLink(created.id, YALE, 'manual')
    const manual = await store.getBriefById(created.id)
    assert.ok(manual)
    const kept = await linkConfidentBriefs(store, [manual], [maya], edits, { persist: true })
    assert.equal(kept[0]?.notion_edit_page_id, YALE)
    assert.equal(kept[0]?.notion_edit_link, 'manual')

    await store.setBriefNotionLink(created.id, null, 'manual')
    const empty = await store.getBriefById(created.id)
    assert.ok(empty)
    const cleared = await linkConfidentBriefs(store, [empty], [maya], edits, { persist: true })
    assert.equal(cleared[0]?.notion_edit_page_id, null)
    assert.equal(cleared[0]?.notion_edit_link, 'manual')
  })

  it('shows the edit status on the owning card and leaves an unmatched brief off every card', () => {
    const edits = [{ id: CORTLANDT, status: 'Edit Started' }]
    const grouped = groupBriefsForRoster(
      [
        brief({ id: 7, notion_edit_page_id: CORTLANDT, notion_edit_link: 'auto' }),
        brief({
          id: 8,
          client_id: null,
          client_email: 'jordan.guest@example.com',
          client_name: 'jordan.guest@example.com',
          property_address: '9 Winter St',
          shoot_date: '2026-12-01',
        }),
      ],
      [maya, andre],
      edits,
      'ready',
    )
    assert.equal(grouped.byClient.get(1)?.[0]?.status, 'Edit Started')
    assert.equal(grouped.byClient.get(1)?.[0]?.title, '1426 Cortlandt St, Houston, TX 77008')
    assert.deepEqual(grouped.unmatched.map((row) => row.id), [8])
    assert.equal(briefEditStatus(CORTLANDT, [], 'unavailable'), 'Linked')
    assert.equal(briefEditStatus(null, edits, 'ready'), 'No edit linked')
    assert.equal(briefEditStatus(YALE, edits, 'ready'), 'Not in the edit list')
  })
})
