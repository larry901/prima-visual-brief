import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addMonths,
  chicagoDate,
  chicagoWallTimeToUtc,
  resolveCycle,
  shootsRemaining,
} from '../lib/portal/cycle'

const COUNTED = ['Listing Shoot', 'Property Shoot', 'Video Shoot']

describe('billing cycle', () => {
  it('keeps a future renewal and opens the cycle one month earlier', () => {
    const cycle = resolveCycle('2026-12-15', '2026-11-11', 15)
    assert.equal(cycle.renewalDate, '2026-12-15')
    assert.equal(cycle.cycleStart, '2026-11-15')
    assert.equal(cycle.anchorDay, 15)
  })

  it('starts a new cycle on the renewal date itself', () => {
    const cycle = resolveCycle('2026-03-31', '2026-03-31', 31)
    assert.equal(cycle.renewalDate, '2026-04-30')
    assert.equal(cycle.cycleStart, '2026-03-31')
  })

  it('rolls a lapsed renewal forward month by month', () => {
    const cycle = resolveCycle('2026-01-31', '2026-04-15', 31)
    assert.equal(cycle.renewalDate, '2026-04-30')
    assert.equal(cycle.cycleStart, '2026-03-31')
  })

  it('clamps short months and restores the anchor day afterward', () => {
    let date = '2024-01-31'
    const months: string[] = []
    for (let i = 0; i < 14; i += 1) {
      months.push(date)
      date = addMonths(date, 1, 31)
    }
    assert.deepEqual(months, [
      '2024-01-31',
      '2024-02-29',
      '2024-03-31',
      '2024-04-30',
      '2024-05-31',
      '2024-06-30',
      '2024-07-31',
      '2024-08-31',
      '2024-09-30',
      '2024-10-31',
      '2024-11-30',
      '2024-12-31',
      '2025-01-31',
      '2025-02-28',
    ])
  })
})

describe('shoots remaining', () => {
  const cycle = { cycleStart: '2026-02-28', renewalDate: '2026-03-31' }

  it('counts shoot types inside the cycle and ignores calls, cancellations, and other cycles', () => {
    const tally = shootsRemaining({
      planSize: 4,
      ...cycle,
      countedTypes: COUNTED,
      appointments: [
        { appointmentType: 'Listing Shoot', startAt: '2026-03-02T16:00:00.000Z', status: 'scheduled' },
        { appointmentType: 'listing shoot', startAt: '2026-03-10T15:00:00.000Z', status: 'rescheduled' },
        { appointmentType: 'Discovery Call', startAt: '2026-03-04T16:00:00.000Z', status: 'scheduled' },
        { appointmentType: 'Property Shoot', startAt: '2026-03-12T16:00:00.000Z', status: 'cancelled' },
        { appointmentType: 'Video Shoot', startAt: '2026-01-15T16:00:00.000Z', status: 'scheduled' },
        { appointmentType: 'Listing Shoot', startAt: '2026-04-02T15:00:00.000Z', status: 'scheduled' },
        {
          appointmentType: 'Listing Shoot',
          startAt: '2026-03-18T16:00:00.000Z',
          status: 'scheduled',
          needsReview: true,
        },
      ],
    })
    assert.deepEqual(tally, { used: 2, remaining: 2 })
  })

  it('does not count a discovery call even when that type is listed', () => {
    const tally = shootsRemaining({
      planSize: 4,
      ...cycle,
      countedTypes: [...COUNTED, 'Discovery Call', 'Discovery'],
      appointments: [
        { appointmentType: 'Discovery Call', startAt: '2026-03-04T16:00:00.000Z', status: 'scheduled' },
        { appointmentType: 'discovery session', startAt: '2026-03-05T16:00:00.000Z', status: 'scheduled' },
        { appointmentType: 'Listing Shoot', startAt: '2026-03-06T16:00:00.000Z', status: 'scheduled' },
      ],
    })
    assert.deepEqual(tally, { used: 1, remaining: 3 })
  })

  it('includes the cycle start, excludes the renewal date, and uses Chicago calendar days', () => {
    const onStart = shootsRemaining({
      planSize: 2,
      cycleStart: '2026-02-28',
      renewalDate: '2026-03-31',
      countedTypes: COUNTED,
      appointments: [
        { appointmentType: 'Listing Shoot', startAt: '2026-02-28T16:00:00.000Z', status: 'scheduled' },
      ],
    })
    assert.equal(onStart.used, 1)

    const lateChicagoNight = shootsRemaining({
      planSize: 2,
      cycleStart: '2026-02-01',
      renewalDate: '2026-03-01',
      countedTypes: COUNTED,
      appointments: [
        // 04:30 UTC on March 1 is still February 28 in Chicago (CST).
        { appointmentType: 'Listing Shoot', startAt: '2026-03-01T04:30:00.000Z', status: 'scheduled' },
      ],
    })
    assert.equal(chicagoDate(new Date('2026-03-01T04:30:00.000Z')), '2026-02-28')
    assert.equal(lateChicagoNight.used, 1)

    const renewalMorning = shootsRemaining({
      planSize: 2,
      cycleStart: '2026-02-01',
      renewalDate: '2026-03-01',
      countedTypes: COUNTED,
      appointments: [
        { appointmentType: 'Listing Shoot', startAt: '2026-03-01T16:00:00.000Z', status: 'scheduled' },
      ],
    })
    assert.equal(renewalMorning.used, 0)
  })

  it('counts a 1-shoot plan down to zero and not below', () => {
    const open = shootsRemaining({
      planSize: 1,
      ...cycle,
      countedTypes: COUNTED,
      appointments: [],
    })
    assert.deepEqual(open, { used: 0, remaining: 1 })

    const booked = shootsRemaining({
      planSize: 1,
      ...cycle,
      countedTypes: COUNTED,
      appointments: [
        { appointmentType: 'Listing Shoot', startAt: '2026-03-02T16:00:00.000Z', status: 'scheduled' },
      ],
    })
    assert.deepEqual(booked, { used: 1, remaining: 0 })

    const overbooked = shootsRemaining({
      planSize: 1,
      ...cycle,
      countedTypes: COUNTED,
      appointments: [
        { appointmentType: 'Listing Shoot', startAt: '2026-03-02T16:00:00.000Z', status: 'scheduled' },
        { appointmentType: 'Video Shoot', startAt: '2026-03-03T16:00:00.000Z', status: 'scheduled' },
      ],
    })
    assert.deepEqual(overbooked, { used: 2, remaining: 0 })
  })

  it('does not go below zero when a plan is overbooked', () => {
    const tally = shootsRemaining({
      planSize: 2,
      ...cycle,
      countedTypes: COUNTED,
      appointments: [
        { appointmentType: 'Listing Shoot', startAt: '2026-03-02T16:00:00.000Z', status: 'scheduled' },
        { appointmentType: 'Listing Shoot', startAt: '2026-03-03T16:00:00.000Z', status: 'scheduled' },
        { appointmentType: 'Listing Shoot', startAt: '2026-03-04T16:00:00.000Z', status: 'scheduled' },
      ],
    })
    assert.deepEqual(tally, { used: 3, remaining: 0 })
  })

  it('converts Chicago wall time across standard and daylight offsets', () => {
    assert.equal(chicagoWallTimeToUtc('2026-01-15', 10, 0).toISOString(), '2026-01-15T16:00:00.000Z')
    assert.equal(chicagoWallTimeToUtc('2026-07-15', 10, 0).toISOString(), '2026-07-15T15:00:00.000Z')
  })
})
