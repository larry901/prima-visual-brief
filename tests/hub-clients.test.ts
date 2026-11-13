import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { deleteNameMatches, removeRosterClient, setClientActive } from '../lib/hub/roster'
import { MemoryHubStore } from '../lib/hub/memory-store'
import { computeKpis } from '../lib/hub/kpis'
import { MemoryStore } from '../lib/portal/memory-store'
import { requestPortalLink } from '../lib/portal/login'

async function clientWithHistory() {
  const portal = new MemoryStore()
  const client = await portal.createClient({
    name: 'Maya Chen',
    email: 'maya.chen@example.com',
    company: 'Harbor & Co Realty',
    kind: 'subscription',
    planSize: 4,
    renewalDate: '2026-12-15',
    schedulingLink: 'https://example.com/schedule/maya',
    frameioUrl: null,
    active: true,
  })
  const counted = await portal.insertAppointment({
    clientId: client.id,
    acuityAppointmentId: 'shoot-1',
    appointmentType: 'Listing Shoot',
    startAt: '2026-11-18T16:00:00.000Z',
    status: 'scheduled',
    source: 'acuity_email',
    clientEmail: client.email,
    clientName: client.name,
    rawSubject: null,
    needsReview: false,
    reviewReason: null,
  })
  const review = await portal.insertAppointment({
    clientId: null,
    acuityAppointmentId: 'review-1',
    appointmentType: 'Listing Shoot',
    startAt: '2026-11-20T16:00:00.000Z',
    status: 'scheduled',
    source: 'acuity_email',
    clientEmail: 'guest@example.com',
    clientName: 'Guest',
    rawSubject: 'New Appointment: Listing Shoot with Guest',
    needsReview: true,
    reviewReason: 'unmatched_client',
  })
  const brief = await portal.createBriefRecord({
    client_name: client.name,
    client_email: client.email,
    client_id: client.id,
    agent_name: 'Maya Chen',
    property_address: '12 Archive Ln',
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
  return { portal, client, counted, review, brief }
}

describe('roster delete', () => {
  it('requires the typed name to match', () => {
    assert.equal(deleteNameMatches('Maya Chen', 'Maya Chen'), true)
    assert.equal(deleteNameMatches('  Maya Chen  ', 'Maya Chen'), true)
    assert.equal(deleteNameMatches('maya chen', 'Maya Chen'), false)
    assert.equal(deleteNameMatches('', 'Maya Chen'), false)
  })

  it('keeps appointments and briefs, and drops the roster row', async () => {
    const { portal, client, counted, review, brief } = await clientWithHistory()
    const hub = new MemoryHubStore()
    const lead = await hub.createLead({
      name: client.name,
      email: client.email,
      source: 'Referral',
      stage: 'Won',
      convertedClientId: client.id,
    })
    await hub.setClientPrice(client.id, 5000)
    assert.equal(await removeRosterClient(portal, hub, client.id), true)

    assert.equal(await portal.getClient(client.id), null)
    const shoots = await portal.listAppointments()
    const kept = shoots.find((row) => row.id === counted.id)
    assert.ok(kept)
    assert.equal(kept.clientId, null)
    assert.equal(kept.needsReview, false)
    assert.equal(kept.appointmentType, 'Listing Shoot')
    assert.equal(kept.status, 'scheduled')
    const waiting = (await portal.listNeedsReview()).find((row) => row.id === review.id)
    assert.ok(waiting)
    assert.equal(waiting.needsReview, true)
    assert.equal(waiting.reviewReason, 'unmatched_client')
    const storedBrief = await portal.getBriefById(brief.id)
    assert.ok(storedBrief)
    assert.equal(storedBrief.client_id, null)
    assert.equal(storedBrief.property_address, '12 Archive Ln')
    assert.equal((await hub.getLead(lead.id))?.convertedClientId, null)
    assert.equal((await hub.getClientPrices()).has(client.id), false)
    assert.deepEqual(await portal.listAppointmentsForClient(client.id), [])
  })
})

describe('inactive clients', () => {
  it('stops portal sign-in and leaves them out of revenue, renewals, and unused shoots', async () => {
    const portal = new MemoryStore()
    const client = await portal.createClient({
      name: 'Priya Nair',
      email: 'priya.nair@example.com',
      company: 'Nair Homes',
      kind: 'subscription',
      planSize: 2,
      renewalDate: '2026-12-01',
      schedulingLink: null,
      frameioUrl: null,
      active: true,
    })
    await setClientActive(portal, client.id, false)
    const stored = await portal.getClient(client.id)
    assert.equal(stored?.active, false)
    const link = await requestPortalLink(portal, 'priya.nair@example.com', 'https://brief.primavisual.io')
    assert.deepEqual(link, { ok: true })
    assert.equal(portal.data.magicLinks.length, 0)

    const report = computeKpis({
      leads: [],
      events: [],
      today: '2026-11-13',
      subscribers: [
        { active: false, monthlyDollars: 2800, remaining: 2, renewalSoon: true },
        { active: true, monthlyDollars: 5000, remaining: 1, renewalSoon: false },
      ],
      appointments: [],
      countedTypes: [],
      edits: [],
    })
    assert.equal(report.activeSubscribers, 1)
    assert.equal(report.recurringDollars, 5000)
    assert.equal(report.renewalsSoon, 0)
    assert.equal(report.unusedShoots, 1)
    assert.equal(report.inactiveSubscribers, 1)
  })
})
