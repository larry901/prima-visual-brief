import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isStaffEmail, requestStaffLink, staffAllowlist } from '../lib/hub/auth'
import { applyDiscoveryLead } from '../lib/hub/leads'
import { MemoryHubStore } from '../lib/hub/memory-store'
import { handleWebsiteLead } from '../lib/hub/website'
import { MemoryStore } from '../lib/portal/memory-store'
import { DEFAULT_COUNTED_TYPES, shootsRemaining } from '../lib/portal/cycle'
import { handleAcuityIngest, type IngestEvent } from '../lib/portal/ingest'

const TOKEN = 'test-ingest-token'
const NOW = new Date('2026-11-13T18:00:00.000Z')
const START = '2026-11-18T16:00:00.000Z'

function discovery(overrides: Partial<IngestEvent> = {}): IngestEvent {
  return {
    event: 'new',
    client_email: 'Jordan.Lee@example.com',
    client_name: 'Jordan Lee',
    appointment_type: 'Discovery Call',
    start: START,
    acuity_appointment_id: 'disc-1',
    raw_subject: 'New Appointment: Discovery Call with Jordan Lee',
    phone: '312-555-0199',
    company: 'Lee Realty',
    ...overrides,
  }
}

function shoot(): IngestEvent {
  return {
    event: 'new',
    client_email: 'maya.chen@example.com',
    client_name: 'Maya Chen',
    appointment_type: 'Listing Shoot',
    start: START,
    acuity_appointment_id: 'shoot-1',
  }
}

async function post(body: unknown, authorization: string | undefined, store: MemoryStore, hub?: MemoryHubStore) {
  const response = await handleAcuityIngest(
    new Request('https://brief.primavisual.io/api/ingest/acuity', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(authorization ? { authorization } : {}),
      },
      body: JSON.stringify(body),
    }),
    store,
    TOKEN,
    hub ? { hub, now: NOW } : { now: NOW },
  )
  return { status: response.status, json: await response.json() }
}

async function roster() {
  const store = new MemoryStore()
  await store.createClient({
    name: 'Maya Chen',
    email: 'maya.chen@example.com',
    company: 'Harbor & Co Realty',
    kind: 'subscription',
    planSize: 4,
    renewalDate: '2026-12-15',
    schedulingLink: null,
    active: true,
    frameioUrl: null,
  })
  return store
}

function used(store: MemoryStore) {
  return shootsRemaining({
    planSize: 4,
    cycleStart: '2026-11-15',
    renewalDate: '2026-12-15',
    countedTypes: [...DEFAULT_COUNTED_TYPES, 'Discovery Call', 'Strategy Call'],
    appointments: store.data.appointments,
  }).used
}

describe('discovery call ingest', () => {
  it('creates a lead and does not use a shoot', async () => {
    const store = await roster()
    const hub = new MemoryHubStore()
    const created = await post(discovery(), `Bearer ${TOKEN}`, store, hub)
    const again = await post(discovery(), `Bearer ${TOKEN}`, store, hub)
    assert.equal(created.status, 200)
    assert.equal(created.json.action, 'created')
    assert.equal(created.json.needs_review, false)
    assert.equal(created.json.review_reason, null)
    assert.equal(created.json.lead_action, 'created')
    assert.equal(again.json.lead_action, 'unchanged')
    assert.equal(again.json.lead_id, created.json.lead_id)
    assert.equal(hub.data.leads.length, 1)
    assert.equal(hub.data.leads[0].stage, 'Discovery Booked')
    assert.equal(hub.data.leads[0].source, 'Acuity discovery call')
    assert.equal(hub.data.leads[0].email, 'jordan.lee@example.com')
    assert.equal(hub.data.leads[0].phone, '312-555-0199')
    assert.equal(hub.data.leads[0].company, 'Lee Realty')
    assert.equal(hub.data.events.length, 1)
    assert.equal(hub.data.events[0].toStage, 'Discovery Booked')
    assert.equal(store.data.appointments[0].needsReview, false)
    assert.equal(used(store), 0)

    const shootResult = await post(shoot(), `Bearer ${TOKEN}`, store, hub)
    assert.equal(shootResult.json.lead_id, null)
    assert.equal(shootResult.json.lead_action, null)
    assert.equal(hub.data.leads.length, 1)
    assert.equal(used(store), 1)
  })

  it('keeps an existing source and moves New to Discovery Booked', async () => {
    const store = new MemoryStore()
    const hub = new MemoryHubStore()
    const existing = await hub.createLead(
      {
        name: 'Jordan Lee',
        email: 'jordan.lee@example.com',
        source: 'Referral',
        referredBy: 'Sam Ortiz',
        stage: 'New',
      },
      NOW,
    )
    const updated = await applyDiscoveryLead(discovery(), hub, NOW)
    assert.equal(updated.action, 'updated')
    assert.equal(updated.leadId, existing.id)
    const lead = await hub.getLead(existing.id)
    assert.equal(lead?.stage, 'Discovery Booked')
    assert.equal(lead?.source, 'Referral')
    assert.equal(lead?.referredBy, 'Sam Ortiz')
    const events = await hub.listStageEvents(existing.id)
    assert.deepEqual(events.map((event) => event.toStage), ['New', 'Discovery Booked'])
  })

  it('opens a new lead when the only match is won or lost', async () => {
    const hub = new MemoryHubStore()
    const won = await hub.createLead(
      { name: 'Jordan Lee', email: 'jordan.lee@example.com', source: 'Referral', stage: 'Won' },
      NOW,
    )
    const created = await applyDiscoveryLead(discovery({ acuity_appointment_id: 'disc-2' }), hub, NOW)
    assert.equal(created.action, 'created')
    assert.notEqual(created.leadId, won.id)
    assert.equal((await hub.listLeads()).length, 2)
  })

  it('reschedules the same lead and cancels without counting a shoot', async () => {
    const store = await roster()
    const hub = new MemoryHubStore()
    await post(discovery(), `Bearer ${TOKEN}`, store, hub)
    const moved = await post(
      discovery({ event: 'rescheduled', start: '2026-11-20T16:00:00.000Z' }),
      `Bearer ${TOKEN}`,
      store,
      hub,
    )
    assert.equal(moved.json.lead_action, 'updated')
    assert.equal(hub.data.leads[0].discoveryStatus, 'rescheduled')
    assert.equal(hub.data.leads.length, 1)
    const cancelled = await post(discovery({ event: 'cancelled' }), `Bearer ${TOKEN}`, store, hub)
    assert.equal(cancelled.json.lead_action, 'updated')
    assert.equal(hub.data.leads[0].stage, 'Discovery Booked')
    assert.equal(hub.data.leads[0].discoveryStatus, 'cancelled')
    assert.equal(used(store), 0)
    assert.equal(store.data.appointments.length, 1)
  })

  it('does not treat a strategy call as a discovery lead', async () => {
    const store = await roster()
    const hub = new MemoryHubStore()
    const response = await post(
      discovery({ appointment_type: 'Strategy Call', acuity_appointment_id: 'strategy-1' }),
      `Bearer ${TOKEN}`,
      store,
      hub,
    )
    assert.equal(response.status, 200)
    assert.equal(response.json.lead_id, null)
    assert.equal(hub.data.leads.length, 0)
  })

  it('rejects a non-string phone without writing a row', async () => {
    const store = new MemoryStore()
    const hub = new MemoryHubStore()
    const response = await post({ ...discovery(), phone: 3125550199 }, `Bearer ${TOKEN}`, store, hub)
    assert.equal(response.status, 400)
    assert.equal(store.data.appointments.length, 0)
    assert.equal(hub.data.leads.length, 0)
  })
})

describe('website lead ingest', () => {
  const token = 'website-token'

  async function submit(
    body: unknown,
    authorization?: string,
    hub = new MemoryHubStore(),
    tokens: { website?: string; acuity?: string } = { website: token },
  ) {
    const response = await handleWebsiteLead(
      new Request('https://brief.primavisual.io/api/ingest/website-lead', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(authorization ? { authorization } : {}),
        },
        body: JSON.stringify(body),
      }),
      hub,
      tokens,
      NOW,
    )
    return { status: response.status, json: await response.json(), hub }
  }

  it('requires its own bearer token and creates one open lead per email', async () => {
    const missing = await submit({ name: 'Casey Ortiz', email: 'casey.ortiz@example.com' })
    assert.equal(missing.status, 401)
    const hub = new MemoryHubStore()
    const created = await submit(
      {
        name: 'Casey Ortiz',
        email: 'Casey.Ortiz@example.com',
        phone: '713-555-0177',
        company: 'Ortiz Homes',
        message: 'Looking at a one-time shoot.',
        service_type: 'project',
        estimated_value: 6000,
      },
      `Bearer ${token}`,
      hub,
    )
    assert.equal(created.status, 200)
    assert.equal(created.json.action, 'created')
    assert.equal(hub.data.leads[0].stage, 'New')
    assert.equal(hub.data.leads[0].source, 'Website form')
    assert.equal(hub.data.leads[0].estimatedValueDollars, 6000)
    assert.equal(hub.data.leads[0].nextFollowUp, '2026-11-13')
    const again = await submit(
      {
        name: 'Casey Ortiz',
        email: 'casey.ortiz@example.com',
        message: 'Looking at a one-time shoot.',
      },
      `Bearer ${token}`,
      hub,
    )
    assert.equal(again.json.action, 'unchanged')
    assert.equal(hub.data.leads.length, 1)
  })

  it('accepts the Acuity ingest token as well as the website token', async () => {
    const payload = { name: 'Casey Ortiz', email: 'casey.ortiz@example.com', message: 'From the Squarespace form.' }
    const neither = await submit(payload, 'Bearer acuity-token', new MemoryHubStore(), {})
    assert.equal(neither.status, 401)
    const acuityOnly = await submit(payload, 'Bearer acuity-token', new MemoryHubStore(), { acuity: 'acuity-token' })
    assert.equal(acuityOnly.status, 200)
    assert.equal(acuityOnly.json.action, 'created')
    const shared = new MemoryHubStore()
    const withAcuity = await submit(payload, 'Bearer acuity-token', shared, {
      website: 'website-token',
      acuity: 'acuity-token',
    })
    assert.equal(withAcuity.status, 200)
    const withWebsite = await submit(payload, 'Bearer website-token', shared, {
      website: 'website-token',
      acuity: 'acuity-token',
    })
    assert.equal(withWebsite.status, 200)
    assert.equal(withWebsite.json.action, 'unchanged')
    const wrong = await submit(payload, 'Bearer someone-else', shared, {
      website: 'website-token',
      acuity: 'acuity-token',
    })
    assert.equal(wrong.status, 401)
    assert.equal(shared.data.leads.length, 1)
  })

  it('rejects a payload without an email', async () => {
    const hub = new MemoryHubStore()
    const response = await submit({ name: 'Casey Ortiz' }, `Bearer ${token}`, hub)
    assert.equal(response.status, 400)
    assert.equal(hub.data.leads.length, 0)
  })
})

describe('staff allowlist', () => {
  const original = process.env.STAFF_EMAILS
  const originalDemo = process.env.PORTAL_DEMO_SEED

  it('matches only the configured addresses and does not reveal who is on the list', async () => {
    process.env.STAFF_EMAILS = 'Owner@example.com, assistant@example.com'
    process.env.PORTAL_DEMO_SEED = 'true'
    try {
      assert.equal(staffAllowlist().size, 2)
      assert.equal(isStaffEmail('owner@example.com'), true)
      assert.equal(isStaffEmail('stranger@example.com'), false)
      const hub = new MemoryHubStore()
      const hidden = await requestStaffLink(hub, 'stranger@example.com', 'https://brief.primavisual.io', NOW)
      assert.deepEqual(hidden, { ok: true })
      assert.equal(hub.data.magicLinks.length, 0)
      const allowed = await requestStaffLink(hub, 'owner@example.com', 'https://brief.primavisual.io', NOW)
      assert.equal(allowed.ok, true)
      if (allowed.ok) assert.match(allowed.demoUrl ?? '', /\/hub\/verify\?token=/)
      assert.equal(hub.data.magicLinks.length, 1)
      assert.equal(hub.data.magicLinks[0].email, 'owner@example.com')
    } finally {
      if (original === undefined) delete process.env.STAFF_EMAILS
      else process.env.STAFF_EMAILS = original
      if (originalDemo === undefined) delete process.env.PORTAL_DEMO_SEED
      else process.env.PORTAL_DEMO_SEED = originalDemo
    }
  })
})
