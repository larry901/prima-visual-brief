import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseClientInput, parsePlanSize, readStoredPlanSize } from '../lib/portal/clients'
import { planSizeConstraintAllowsOne } from '../lib/portal/neon-store'
import { MemoryStore } from '../lib/portal/memory-store'
import { shootsPerMonthLabel, loadPortalView } from '../lib/portal/view'

const NOW = new Date('2026-11-11T18:00:00.000Z')

function subscription(planSize: unknown) {
  return {
    name: 'Casey Example',
    email: 'casey.example@example.com',
    company: 'Example Realty',
    kind: 'subscription',
    planSize,
    renewalDate: '2026-12-01',
    schedulingLink: 'https://example.com/schedule?certificate=EXAMPLE-CODE',
    active: true,
    frameioUrl: null,
  }
}

describe('plan size validation', () => {
  it('accepts 1, 2, and 4 as numbers or strings', () => {
    for (const planSize of [1, 2, 4, '1', '2', '4']) {
      const parsed = parseClientInput(subscription(planSize))
      assert.equal(parsed.ok, true)
      if (parsed.ok) assert.equal(parsed.value.planSize, Number(planSize))
      assert.equal(parsePlanSize(planSize), Number(planSize))
    }
  })

  it('rejects any other plan size', () => {
    for (const planSize of [0, 3, 5, '0', '3', '1.0', ' 1', true, null, undefined]) {
      const parsed = parseClientInput(subscription(planSize))
      assert.equal(parsed.ok, false)
      if (!parsed.ok) assert.equal(parsed.error, 'Plan size must be 1, 2, or 4')
    }
  })

  it('reads a stored 1 and still ignores values that are not a plan', () => {
    assert.equal(readStoredPlanSize(1), 1)
    assert.equal(readStoredPlanSize('1'), 1)
    assert.equal(readStoredPlanSize('2'), 2)
    assert.equal(readStoredPlanSize('4'), 4)
    assert.equal(readStoredPlanSize(2), 2)
    assert.equal(readStoredPlanSize(4), 4)
    assert.equal(readStoredPlanSize(true), null)
    assert.equal(readStoredPlanSize(3), null)
    assert.equal(readStoredPlanSize(null), null)
    assert.equal(readStoredPlanSize(''), null)
  })
})

describe('plan size constraint', () => {
  it('recognizes the check Postgres stores after IN (1, 2, 4)', () => {
    assert.equal(
      planSizeConstraintAllowsOne('CHECK ((plan_size IS NULL OR (plan_size = ANY (ARRAY[1, 2, 4]))))'),
      true,
    )
    assert.equal(
      planSizeConstraintAllowsOne('CHECK (plan_size IS NULL OR plan_size IN (1, 2, 4))'),
      true,
    )
    assert.equal(
      planSizeConstraintAllowsOne('CHECK ((plan_size IS NULL OR (plan_size = ANY (ARRAY[2, 4]))))'),
      false,
    )
    assert.equal(
      planSizeConstraintAllowsOne('CHECK (plan_size IS NULL OR plan_size IN (2, 4))'),
      false,
    )
    assert.equal(planSizeConstraintAllowsOne(''), false)
  })
})

describe('portal plan wording and cycle count', () => {
  it('uses the singular only for a 1-shoot plan', () => {
    assert.equal(shootsPerMonthLabel(1), 'shoot / month')
    assert.equal(shootsPerMonthLabel(2), 'shoots / month')
    assert.equal(shootsPerMonthLabel(4), 'shoots / month')
    assert.equal(shootsPerMonthLabel(null), 'shoots / month')
  })

  it('leaves one shoot, then zero, on a 1-shoot plan', async () => {
    const store = new MemoryStore()
    const client = await store.createClient({
      name: 'Casey Example',
      email: 'casey.example@example.com',
      company: 'Example Realty',
      kind: 'subscription',
      planSize: 1,
      renewalDate: '2026-12-01',
      schedulingLink: null,
      active: true,
      frameioUrl: null,
    })
    const open = await loadPortalView(store, client, NOW)
    assert.equal(open.showPlan, true)
    assert.equal(open.planSize, 1)
    assert.equal(open.used, 0)
    assert.equal(open.remaining, 1)

    await store.insertAppointment({
      clientId: client.id,
      acuityAppointmentId: 'example-casey-1',
      appointmentType: 'Listing Shoot',
      startAt: '2026-11-18T16:00:00.000Z',
      status: 'scheduled',
      source: 'test',
      clientEmail: client.email,
      clientName: client.name,
      rawSubject: null,
      needsReview: false,
      reviewReason: null,
    })
    const booked = await loadPortalView(store, client, NOW)
    assert.equal(booked.planSize, 1)
    assert.equal(booked.used, 1)
    assert.equal(booked.remaining, 0)
  })

  it('still gives a full 2-shoot and 4-shoot allowance when nothing is booked', async () => {
    const store = new MemoryStore()
    for (const planSize of [2, 4] as const) {
      const client = await store.createClient({
        name: `Plan ${planSize}`,
        email: `plan${planSize}@example.com`,
        company: 'Example Realty',
        kind: 'subscription',
        planSize,
        renewalDate: '2026-12-01',
        schedulingLink: null,
        active: true,
        frameioUrl: null,
      })
      const view = await loadPortalView(store, client, NOW)
      assert.equal(view.planSize, planSize)
      assert.equal(view.used, 0)
      assert.equal(view.remaining, planSize)
    }
  })
})
