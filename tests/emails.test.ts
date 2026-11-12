import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseClientInput } from '../lib/portal/clients'
import type { ClientInput } from '../lib/portal/types'
import { applyIngestEvent } from '../lib/portal/ingest'
import { requestPortalLink } from '../lib/portal/login'
import { MemoryStore } from '../lib/portal/memory-store'
import { loadPortalView } from '../lib/portal/view'

const NOW = new Date('2026-11-11T18:00:00.000Z')

function base(overrides: Partial<ClientInput> = {}): ClientInput {
  return {
    name: 'Casey Example',
    email: 'casey.example@example.com',
    company: 'Example Realty',
    kind: 'subscription',
    planSize: 4,
    renewalDate: '2026-12-01',
    schedulingLink: null,
    active: true,
    frameioUrl: null,
    ...overrides,
  }
}

describe('additional emails', () => {
  it('accepts a primary plus extras and rejects duplicates or bad addresses', () => {
    const parsed = parseClientInput(base({
      additionalEmails: ['Sam.Example@example.com', 'sam.example@example.com', 'jo@example.com'],
    }))
    assert.equal(parsed.ok, true)
    if (parsed.ok) {
      assert.deepEqual(parsed.value.additionalEmails, ['sam.example@example.com', 'jo@example.com'])
    }

    const omitted = parseClientInput(base())
    assert.equal(omitted.ok, true)
    if (omitted.ok) assert.deepEqual(omitted.value.additionalEmails, [])

    const sameAsPrimary = parseClientInput(base({ additionalEmails: ['Casey.Example@example.com'] }))
    assert.equal(sameAsPrimary.ok, false)
    if (!sameAsPrimary.ok) {
      assert.equal(sameAsPrimary.error, 'Additional emails must be different from the primary email')
    }

    const invalid = parseClientInput(base({ additionalEmails: ['not-an-email'] }))
    assert.equal(invalid.ok, false)
  })

  it('keeps a single-email client working and matches every address, ignoring case', async () => {
    const store = new MemoryStore()
    const client = await store.createClient(base({
      additionalEmails: ['Sam.Example@example.com', 'jo@example.com'],
    }))
    assert.equal(client.email, 'casey.example@example.com')
    assert.deepEqual(client.additionalEmails, ['sam.example@example.com', 'jo@example.com'])

    const solo = await store.createClient(base({
      name: 'Solo Example',
      email: 'solo.example@example.com',
      planSize: 2,
    }))
    assert.deepEqual(solo.additionalEmails, [])
    assert.equal((await store.findClientByEmail('SOLO.EXAMPLE@example.com'))?.id, solo.id)

    assert.equal((await store.findClientByEmail('sam.example@example.com'))?.id, client.id)
    assert.equal((await store.findClientByEmail('JO@example.com'))?.id, client.id)
    assert.equal((await store.findClientByEmail('casey.example@example.com'))?.id, client.id)
  })

  it('refuses an email that already belongs to another client', async () => {
    const store = new MemoryStore()
    await store.createClient(base({ additionalEmails: ['sam.example@example.com'] }))
    await assert.rejects(
      () => store.createClient(base({ name: 'Other Example', email: 'sam.example@example.com' })),
      /already exists/,
    )
    await assert.rejects(
      () => store.createClient(base({
        name: 'Other Example',
        email: 'other.example@example.com',
        additionalEmails: ['CASEY.EXAMPLE@example.com'],
      })),
      /already exists/,
    )
  })

  it('lets another client take an email after it is removed', async () => {
    const store = new MemoryStore()
    const client = await store.createClient(base({ additionalEmails: ['sam.example@example.com'] }))
    await store.updateClient(client.id, base({ additionalEmails: [] }))
    const other = await store.createClient(base({
      name: 'Sam Example',
      email: 'sam.example@example.com',
      planSize: 2,
    }))
    assert.equal((await store.findClientByEmail('sam.example@example.com'))?.id, other.id)
    assert.equal((await store.findClientByEmail('casey.example@example.com'))?.id, client.id)
  })

  it('counts an Acuity booking from any address on a 1-shoot plan', async () => {
    const store = new MemoryStore()
    const client = await store.createClient(base({
      planSize: 1,
      additionalEmails: ['sam.example@example.com'],
    }))
    const open = await loadPortalView(store, client, NOW)
    assert.equal(open.planSize, 1)
    assert.equal(open.remaining, 1)

    const result = await applyIngestEvent({
      event: 'new',
      client_email: 'Sam.Example@example.com',
      client_name: 'Sam Example',
      appointment_type: 'Listing Shoot',
      start: '2026-11-18T16:00:00.000Z',
      acuity_appointment_id: 'example-sam-1',
    }, store)
    assert.equal(result.needs_review, false)
    assert.equal(store.data.appointments[0].clientId, client.id)

    const booked = await loadPortalView(store, client, NOW)
    assert.equal(booked.used, 1)
    assert.equal(booked.remaining, 0)

    await applyIngestEvent({
      event: 'new',
      client_email: 'casey.example@example.com',
      client_name: 'Casey Example',
      appointment_type: 'Listing Shoot',
      start: '2026-11-20T16:00:00.000Z',
      acuity_appointment_id: 'example-casey-2',
    }, store)
    const both = await loadPortalView(store, client, NOW)
    assert.equal(both.used, 2)
    assert.equal(both.remaining, 0)
  })

  it('attaches a waiting appointment when that address is added', async () => {
    const store = new MemoryStore()
    const client = await store.createClient(base())
    await store.insertAppointment({
      clientId: null,
      acuityAppointmentId: 'example-waiting-1',
      appointmentType: 'Listing Shoot',
      startAt: '2026-11-18T16:00:00.000Z',
      status: 'scheduled',
      source: 'acuity_email',
      clientEmail: 'sam.example@example.com',
      clientName: 'Sam Example',
      rawSubject: null,
      needsReview: true,
      reviewReason: 'unmatched_client',
    })
    await store.updateClient(client.id, base({ additionalEmails: ['sam.example@example.com'] }))
    const row = store.data.appointments[0]
    assert.equal(row.clientId, client.id)
    assert.equal(row.needsReview, false)
    assert.equal(row.reviewReason, null)
    const view = await loadPortalView(store, client, NOW)
    assert.equal(view.used, 1)
    assert.equal(view.remaining, 3)
  })

  it('sends a magic link for an additional email to that same client', async () => {
    const previous = process.env.PORTAL_DEMO_SEED
    process.env.PORTAL_DEMO_SEED = 'true'
    try {
      const store = new MemoryStore()
      const client = await store.createClient(base({ additionalEmails: ['sam.example@example.com'] }))
      const result = await requestPortalLink(store, 'Sam.Example@example.com', 'https://example.com', NOW)
      assert.equal(result.ok, true)
      if (result.ok) assert.match(result.demoUrl ?? '', /^https:\/\/example.com\/portal\/verify\?token=/)
      assert.equal(store.data.magicLinks.length, 1)
      assert.equal(store.data.magicLinks[0].clientId, client.id)

      const unknown = await requestPortalLink(store, 'nobody@example.com', 'https://example.com', NOW)
      assert.equal(unknown.ok, true)
      if (unknown.ok) assert.equal(unknown.demoUrl, undefined)
      assert.equal(store.data.magicLinks.length, 1)
    } finally {
      if (previous === undefined) delete process.env.PORTAL_DEMO_SEED
      else process.env.PORTAL_DEMO_SEED = previous
    }
  })
})
