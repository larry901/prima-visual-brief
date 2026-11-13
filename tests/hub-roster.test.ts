import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { partitionClients, type HubClientCard } from '../lib/hub/client-card'
import { MemoryHubStore } from '../lib/hub/memory-store'
import { removeRosterClient } from '../lib/portal/remove-client'
import { MemoryStore } from '../lib/portal/memory-store'
import type { BriefRow } from '../lib/db'

function card(overrides: Partial<HubClientCard> & Pick<HubClientCard, 'id' | 'name' | 'kind' | 'active'>): HubClientCard {
  return {
    company: '',
    email: 'person@example.com',
    additionalEmails: [],
    planSize: overrides.kind === 'subscription' ? 2 : null,
    used: 0,
    remaining: 2,
    renewalDate: '',
    renewalLabel: '',
    renewalSoon: false,
    schedulingLink: null,
    frameioUrl: null,
    notionClientId: null,
    monthlyDollars: null,
    priceSource: 'unset',
    ...overrides,
  }
}

function brief(clientId: number, id: number): BriefRow {
  return {
    id,
    client_name: 'Maya Chen',
    agent_name: 'Maya Chen',
    property_address: '1 Example St',
    shoot_date: '2026-11-20',
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
    client_id: clientId,
    client_email: 'maya.chen@example.com',
    updated_at: null,
    edited_by_client: false,
    previous_snapshot: null,
    edit_token_hash: null,
  }
}

describe('inactive roster', () => {
  it('keeps inactive clients out of the subscriber and project lists', () => {
    const groups = partitionClients([
      card({ id: 1, name: 'Maya Chen', kind: 'subscription', active: true, remaining: 3 }),
      card({ id: 2, name: 'Priya Nair', kind: 'subscription', active: false, remaining: 2 }),
      card({ id: 3, name: 'Andre Walsh', kind: 'project', active: true, remaining: 0 }),
      card({ id: 4, name: 'Casey Ortiz', kind: 'project', active: false, remaining: 0 }),
    ])
    assert.deepEqual(groups.subscribers.map((client) => client.id), [1])
    assert.deepEqual(groups.projects.map((client) => client.id), [3])
    assert.deepEqual(groups.inactive.map((client) => client.name), ['Casey Ortiz', 'Priya Nair'])
    assert.equal(
      groups.subscribers.reduce((sum, client) => sum + client.remaining, 0),
      3,
    )
  })

  it('keeps per-client fields such as the portal link when grouping', () => {
    const groups = partitionClients([
      { ...card({ id: 1, name: 'Maya Chen', kind: 'subscription', active: true }), portalUrl: 'https://example.com/portal/c/token' },
      { ...card({ id: 2, name: 'Priya Nair', kind: 'subscription', active: false }), portalUrl: null },
    ])
    assert.equal(groups.subscribers[0]?.portalUrl, 'https://example.com/portal/c/token')
    assert.equal(groups.inactive[0]?.portalUrl, null)
  })
})

describe('delete roster client', () => {
  it('keeps appointments and briefs, and drops the price and converted pointer', async () => {
    const portal = new MemoryStore()
    const hub = new MemoryHubStore()
    const maya = await portal.createClient({
      name: 'Maya Chen',
      email: 'maya.chen@example.com',
      company: 'Harbor & Co Realty',
      kind: 'subscription',
      planSize: 4,
      renewalDate: '2026-12-15',
      schedulingLink: null,
      frameioUrl: null,
      active: true,
    })
    const andre = await portal.createClient({
      name: 'Andre Walsh',
      email: 'andre.walsh@example.com',
      company: 'Walsh Group',
      kind: 'project',
      planSize: null,
      renewalDate: null,
      schedulingLink: null,
      frameioUrl: null,
      active: true,
    })
    const shoot = await portal.insertAppointment({
      clientId: maya.id,
      acuityAppointmentId: 'shoot-maya',
      appointmentType: 'Listing Shoot',
      startAt: '2026-11-18T16:00:00.000Z',
      status: 'scheduled',
      source: 'acuity_email',
      clientEmail: maya.email,
      clientName: maya.name,
      rawSubject: null,
      needsReview: false,
      reviewReason: null,
    })
    const review = await portal.insertAppointment({
      clientId: maya.id,
      acuityAppointmentId: null,
      appointmentType: 'Listing Shoot',
      startAt: '2026-11-20T16:00:00.000Z',
      status: 'scheduled',
      source: 'acuity_email',
      clientEmail: 'unknown@example.com',
      clientName: 'Unknown',
      rawSubject: 'New Appointment',
      needsReview: true,
      reviewReason: 'unmatched_client',
    })
    const other = await portal.insertAppointment({
      clientId: andre.id,
      acuityAppointmentId: 'shoot-andre',
      appointmentType: 'Listing Shoot',
      startAt: '2026-11-19T16:00:00.000Z',
      status: 'scheduled',
      source: 'acuity_email',
      clientEmail: andre.email,
      clientName: andre.name,
      rawSubject: null,
      needsReview: false,
      reviewReason: null,
    })
    portal.data.briefs.push(brief(maya.id, 1), brief(andre.id, 2))
    await portal.createSession(maya.id, 'session-hash', '2026-12-01T00:00:00.000Z')
    await hub.setClientPrice(maya.id, 5000)
    const lead = await hub.createLead(
      { name: 'Maya Chen', email: maya.email, source: 'Website form', stage: 'Won', convertedClientId: maya.id },
      new Date('2026-11-01T00:00:00.000Z'),
    )

    const refused = await removeRosterClient(portal, hub, maya.id, 'maya')
    assert.equal(refused.ok, false)
    if (!refused.ok) assert.equal(refused.status, 400)
    assert.equal((await portal.getClient(maya.id))?.name, 'Maya Chen')
    assert.equal((await portal.listNeedsReview()).length, 1)

    const removed = await removeRosterClient(portal, hub, maya.id, ' Maya Chen ')
    assert.deepEqual(removed, { ok: true })
    assert.equal(await portal.getClient(maya.id), null)
    assert.equal((await portal.listAppointments()).length, 3)
    const keptShoot = (await portal.listAppointments()).find((row) => row.id === shoot.id)
    const keptReview = (await portal.listNeedsReview()).find((row) => row.id === review.id)
    assert.equal(keptShoot?.clientId, null)
    assert.equal(keptShoot?.status, 'scheduled')
    assert.equal(keptShoot?.acuityAppointmentId, 'shoot-maya')
    assert.ok(keptReview)
    assert.equal(keptReview?.clientId, null)
    assert.equal(keptReview?.needsReview, true)
    assert.equal(keptReview?.reviewReason, 'unmatched_client')
    assert.equal((await portal.listAppointments()).find((row) => row.id === other.id)?.clientId, andre.id)
    const briefs = await portal.listAllBriefs()
    assert.equal(briefs.find((row) => row.id === 1)?.client_id, null)
    assert.equal(briefs.find((row) => row.id === 1)?.property_address, '1 Example St')
    assert.equal(briefs.find((row) => row.id === 2)?.client_id, andre.id)
    assert.equal((await hub.getClientPrices()).has(maya.id), false)
    assert.equal((await hub.getLead(lead.id))?.convertedClientId, null)
    assert.equal(await portal.getClientBySession('session-hash', '2026-11-13T00:00:00.000Z'), null)
    const missing = await removeRosterClient(portal, hub, maya.id, 'Maya Chen')
    assert.equal(missing.ok, false)
    if (!missing.ok) assert.equal(missing.status, 404)
  })
})
