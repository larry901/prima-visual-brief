import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  briefEditClosesAt,
  briefIsEditable,
  canAccessBrief,
  changedBriefFields,
  clientOwnsBrief,
} from '../lib/brief-logic'
import { chicagoWallTimeToUtc } from '../lib/portal/cycle'

const maya = { id: 1, email: 'maya.chen@example.com' }
const andre = { id: 2, email: 'andre.walsh@example.com' }

describe('brief ownership', () => {
  it('matches a client id or email and ignores a shared agent name', () => {
    assert.equal(clientOwnsBrief({ client_id: 1, client_email: 'other@example.com', agent_name: 'Maya Chen' }, maya), true)
    assert.equal(clientOwnsBrief({ client_id: null, client_email: 'Maya.Chen@example.com' }, maya), true)
    assert.equal(clientOwnsBrief({ client_id: null, client_name: 'maya.chen@example.com' }, maya), true)
    assert.equal(clientOwnsBrief({ client_id: 2, client_email: 'andre.walsh@example.com', agent_name: 'Maya Chen' }, maya), false)
    assert.equal(canAccessBrief({ client_id: 2, edit_token_hash: 'hash' }, { client: maya, tokenHash: 'nope' }), false)
    assert.equal(canAccessBrief({ client_id: 2, edit_token_hash: 'hash' }, { client: andre, tokenHash: null }), true)
    assert.equal(canAccessBrief({ client_id: 2, edit_token_hash: 'hash' }, { client: null, tokenHash: 'hash' }), true)
  })
})

describe('brief edit window', () => {
  it('locks a date-only brief at midnight Chicago on the shoot date', () => {
    const closes = briefEditClosesAt('2026-11-14')
    assert.ok(closes)
    assert.equal(closes.toISOString(), chicagoWallTimeToUtc('2026-11-14', 0, 0).toISOString())
    assert.equal(briefIsEditable(new Date('2026-11-13T18:00:00.000Z'), closes), true)
    assert.equal(briefIsEditable(closes, closes), false)
  })

  it('uses the appointment start when one falls on the shoot date', () => {
    const start = '2026-11-14T16:00:00.000Z'
    const closes = briefEditClosesAt('2026-11-14', ['2026-11-15T16:00:00.000Z', start])
    assert.equal(closes?.toISOString(), start)
    assert.equal(briefIsEditable(new Date('2026-11-14T15:00:00.000Z'), closes), true)
    assert.equal(briefIsEditable(new Date('2026-11-14T16:00:00.000Z'), closes), false)
  })

  it('refuses an invalid shoot date', () => {
    assert.equal(briefEditClosesAt('not-a-date'), null)
    assert.equal(briefIsEditable(new Date(), null), false)
  })
})

describe('brief edits', () => {
  it('names the fields that changed and ignores identical JSON', () => {
    const before = {
      agent_name: 'Maya Chen',
      property_address: '1426 Cortlandt St',
      shoot_date: '2026-11-14',
      agent_on_site: 'Yes',
      gate_code: '',
      lockbox_code: null,
      access_notes: null,
      video_types: '["Listing Tour"]',
      video_details: '{"Listing Tour":{"highlights":"Oak floors"}}',
      drive_link: null,
      asset_notes: null,
    }
    const same = { ...before, video_details: '{"Listing Tour":{"highlights":"Oak floors"}}' }
    assert.deepEqual(changedBriefFields(before, same), [])
    const after = { ...before, property_address: '88 Yale St', asset_notes: 'Use the dusk still.' }
    assert.deepEqual(changedBriefFields(before, after), ['Property', 'Asset notes'])
  })
})
