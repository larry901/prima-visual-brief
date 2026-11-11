import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MemoryStore } from '../lib/portal/memory-store'
import { applyIngestEvent, handleAcuityIngest, type IngestEvent } from '../lib/portal/ingest'
import type { IngestStore } from '../lib/portal/types'

const START = '2026-11-18T16:00:00.000Z'
const LATER = '2026-11-20T16:00:00.000Z'

function event(overrides: Partial<IngestEvent> = {}): IngestEvent {
  return {
    event: 'new',
    client_email: 'Maya.Chen@example.com',
    client_name: 'Maya Chen',
    appointment_type: 'Listing Shoot',
    start: START,
    acuity_appointment_id: 'acuity-1',
    raw_subject: 'New Appointment: Listing Shoot with Maya Chen',
    ...overrides,
  }
}

async function roster() {
  const store = new MemoryStore()
  await store.createClient({
    name: 'Maya Chen',
    email: 'maya.chen@example.com',
    company: 'Harbor & Co Realty',
    planSize: 4,
    renewalDate: '2026-12-15',
    active: true,
    frameioLinks: [],
  })
  return store
}

describe('acuity ingest', () => {
  it('creates a shoot, then treats the same payload as unchanged', async () => {
    const store = await roster()
    const created = await applyIngestEvent(event(), store)
    const again = await applyIngestEvent(event(), store)
    assert.equal(created.action, 'created')
    assert.equal(created.needs_review, false)
    assert.equal(again.action, 'unchanged')
    assert.equal(again.appointment_id, created.appointment_id)
    assert.equal(store.data.appointments.length, 1)
    assert.equal(store.data.appointments[0].clientEmail, 'maya.chen@example.com')
    assert.equal(store.data.appointments[0].status, 'scheduled')
  })

  it('reschedules by acuity id and does not let a repeated new event rewind it', async () => {
    const store = await roster()
    await applyIngestEvent(event(), store)
    const moved = await applyIngestEvent(event({ event: 'rescheduled', start: LATER, raw_subject: 'Appointment Rescheduled: Listing Shoot' }), store)
    assert.equal(moved.action, 'updated')
    assert.equal(store.data.appointments[0].status, 'rescheduled')
    assert.equal(store.data.appointments[0].startAt, LATER)
    const replay = await applyIngestEvent(event(), store)
    assert.equal(replay.action, 'unchanged')
    assert.equal(store.data.appointments[0].startAt, LATER)
    assert.equal(store.data.appointments.length, 1)
  })

  it('cancels by acuity id and ignores a later new event for that id', async () => {
    const store = await roster()
    await applyIngestEvent(event(), store)
    const cancelled = await applyIngestEvent(event({ event: 'cancelled' }), store)
    const again = await applyIngestEvent(event({ event: 'cancelled' }), store)
    const revived = await applyIngestEvent(event(), store)
    assert.equal(cancelled.action, 'updated')
    assert.equal(again.action, 'unchanged')
    assert.equal(revived.action, 'unchanged')
    assert.equal(store.data.appointments[0].status, 'cancelled')
  })

  it('keeps unmatched emails for review instead of dropping them', async () => {
    const store = await roster()
    const first = await applyIngestEvent(event({
      client_email: 'jordan.guest@example.com',
      client_name: 'Jordan Guest',
      acuity_appointment_id: 'acuity-guest',
    }), store)
    const second = await applyIngestEvent(event({
      client_email: 'jordan.guest@example.com',
      client_name: 'Jordan Guest',
      acuity_appointment_id: 'acuity-guest',
    }), store)
    assert.equal(first.action, 'created')
    assert.equal(first.needs_review, true)
    assert.equal(first.review_reason, 'unmatched_client')
    assert.equal(second.action, 'unchanged')
    const review = await store.listNeedsReview()
    assert.equal(review.length, 1)
    assert.equal(review[0].clientId, null)
  })

  it('updates the only open appointment when a reschedule has no acuity id', async () => {
    const store = await roster()
    await applyIngestEvent(event({ acuity_appointment_id: undefined }), store)
    const moved = await applyIngestEvent(event({
      event: 'rescheduled',
      start: LATER,
      acuity_appointment_id: undefined,
    }), store)
    const replay = await applyIngestEvent(event({
      event: 'rescheduled',
      start: LATER,
      acuity_appointment_id: undefined,
    }), store)
    assert.equal(moved.action, 'updated')
    assert.equal(replay.action, 'unchanged')
    assert.equal(store.data.appointments.length, 1)
    assert.equal(store.data.appointments[0].startAt, LATER)
  })

  it('does not guess when several shoots could match a reschedule', async () => {
    const store = await roster()
    await applyIngestEvent(event({ acuity_appointment_id: undefined, start: START }), store)
    await applyIngestEvent(event({ acuity_appointment_id: undefined, start: '2026-11-19T16:00:00.000Z' }), store)
    const ambiguous = await applyIngestEvent(event({
      event: 'rescheduled',
      start: LATER,
      acuity_appointment_id: undefined,
    }), store)
    assert.equal(ambiguous.needs_review, true)
    assert.equal(ambiguous.review_reason, 'ambiguous_reschedule')
    const open = await store.listOpenAppointments('maya.chen@example.com', 'Listing Shoot')
    assert.equal(open.length, 2)
    assert.ok(open.every((row) => row.startAt !== LATER))
  })

  it('matches a natural-key replay of a new booking', async () => {
    const store = await roster()
    const created = await applyIngestEvent(event({ acuity_appointment_id: undefined }), store)
    const again = await applyIngestEvent(event({
      acuity_appointment_id: undefined,
      start: '2026-11-18T10:00:00-06:00',
    }), store)
    assert.equal(created.action, 'created')
    assert.equal(again.action, 'unchanged')
    assert.equal(store.data.appointments.length, 1)
  })
})

describe('POST /api/ingest/acuity', () => {
  const token = 'test-ingest-token'

  async function post(body: unknown, authorization?: string, store: IngestStore = new MemoryStore()) {
    const response = await handleAcuityIngest(
      new Request('https://brief.primavisual.io/api/ingest/acuity', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(authorization ? { authorization } : {}),
        },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
      store,
      token,
    )
    return { status: response.status, json: await response.json() }
  }

  it('rejects a missing or wrong bearer token', async () => {
    const missing = await post(event(), undefined)
    const wrong = await post(event(), 'Bearer nope')
    assert.equal(missing.status, 401)
    assert.equal(wrong.status, 401)
  })

  it('rejects malformed JSON and incomplete events', async () => {
    const badJson = await post('{', `Bearer ${token}`)
    const missingStart = await post({ event: 'new', client_email: 'a@example.com', client_name: 'A', appointment_type: 'Listing Shoot' }, `Bearer ${token}`)
    assert.equal(badJson.status, 400)
    assert.equal(missingStart.status, 400)
  })

  it('accepts a valid event and returns the upsert result', async () => {
    const store = await roster()
    const response = await post(event(), `Bearer ${token}`, store)
    assert.equal(response.status, 200)
    assert.equal(response.json.ok, true)
    assert.equal(response.json.action, 'created')
    assert.equal(response.json.needs_review, false)
    const replay = await post(event(), `Bearer ${token}`, store)
    assert.equal(replay.status, 200)
    assert.equal(replay.json.action, 'unchanged')
    assert.equal(replay.json.appointment_id, response.json.appointment_id)
  })
})
