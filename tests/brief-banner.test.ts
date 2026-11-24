import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { chicagoWallTimeToUtc } from '../lib/portal/cycle'
import { MemoryStore } from '../lib/portal/memory-store'
import type { AppointmentStatus, ClientRecord } from '../lib/portal/types'
import { loadPortalView } from '../lib/portal/view'

const NOW = new Date('2026-11-11T18:00:00.000Z')

function shootParam(href: string): string | null {
  return new URL(href, 'http://example.com').searchParams.get('shoot')
}

async function client(store: MemoryStore): Promise<ClientRecord> {
  return store.createClient({
    name: 'Maya Chen',
    email: 'maya.chen@example.com',
    company: 'Harbor & Co Realty',
    kind: 'subscription',
    planSize: 4,
    renewalDate: '2026-12-01',
    schedulingLink: null,
    active: true,
    frameioUrl: null,
  })
}

async function book(
  store: MemoryStore,
  owner: ClientRecord,
  date: string,
  appointmentType: string,
  status: AppointmentStatus = 'scheduled',
) {
  await store.insertAppointment({
    clientId: owner.id,
    acuityAppointmentId: `${appointmentType}-${date}-${status}`,
    appointmentType,
    startAt: chicagoWallTimeToUtc(date, 10, 0).toISOString(),
    status,
    source: 'test',
    clientEmail: owner.email,
    clientName: owner.name,
    rawSubject: null,
    needsReview: false,
    reviewReason: null,
  })
}

async function brief(store: MemoryStore, owner: ClientRecord, shootDate: string) {
  await store.createBriefRecord({
    client_name: owner.email,
    client_email: owner.email,
    client_id: owner.id,
    agent_name: owner.name,
    property_address: `Property ${shootDate}`,
    shoot_date: shootDate,
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
}

describe('portal brief banner target', () => {
  it('targets the earliest upcoming shoot that has no brief yet', async () => {
    const store = new MemoryStore()
    const owner = await client(store)
    await book(store, owner, '2026-11-18', 'Listing Shoot')
    await book(store, owner, '2026-11-20', 'Discovery Call')
    await book(store, owner, '2026-11-21', 'Listing Shoot', 'cancelled')
    await book(store, owner, '2026-11-25', 'Listing Shoot')
    await book(store, owner, '2026-12-02', 'Listing Shoot')
    await brief(store, owner, '2026-11-18')

    const view = await loadPortalView(store, owner, NOW)

    assert.equal(view.nextShoot && shootParam(view.nextShoot.briefHref), '2026-11-18')
    assert.equal(view.nextShoot?.needsBrief, false)
    assert.equal(shootParam(view.briefHref), '2026-11-18')
    assert.equal(view.briefNeeded && shootParam(view.briefNeeded.briefHref), '2026-11-25')
    assert.equal(view.briefNeeded?.needsBrief, true)
  })

  it('uses the next shoot when that one still needs a brief', async () => {
    const store = new MemoryStore()
    const owner = await client(store)
    await book(store, owner, '2026-11-18', 'Listing Shoot')
    await book(store, owner, '2026-11-25', 'Listing Shoot')
    await brief(store, owner, '2026-11-25')

    const view = await loadPortalView(store, owner, NOW)

    assert.equal(view.briefNeeded && shootParam(view.briefNeeded.briefHref), '2026-11-18')
    assert.equal(view.nextShoot?.needsBrief, true)
  })

  it('stays empty when every upcoming shoot already has a brief', async () => {
    const store = new MemoryStore()
    const owner = await client(store)
    await book(store, owner, '2026-11-18', 'Listing Shoot')
    await book(store, owner, '2026-11-20', 'Discovery Call')
    await book(store, owner, '2026-11-25', 'One-Time Shoot')
    await brief(store, owner, '2026-11-18')
    await brief(store, owner, '2026-11-25')

    const view = await loadPortalView(store, owner, NOW)

    assert.equal(view.briefNeeded, null)
    assert.equal(view.upcoming.some((appointment) => appointment.needsBrief), false)
    assert.equal(shootParam(view.briefHref), '2026-11-18')
  })
})
