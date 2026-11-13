import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeKpis, conversionSlice, editMetrics, weekStartMonday, type KpiLead } from '../lib/hub/kpis'
import type { KpiStageEvent } from '../lib/hub/kpis'

const TODAY = '2026-11-13'

function lead(overrides: Partial<KpiLead> & Pick<KpiLead, 'id' | 'stage' | 'source'>): KpiLead {
  return {
    serviceType: null,
    estimatedValueDollars: null,
    nextFollowUp: null,
    ...overrides,
  }
}

describe('conversion math', () => {
  const leads: KpiLead[] = [
    lead({ id: 1, source: 'Referral', stage: 'Discovery Booked' }),
    lead({ id: 2, source: 'Instagram DM', stage: 'New' }),
    lead({ id: 3, source: 'Website form', stage: 'Proposal Sent', serviceType: 'project', estimatedValueDollars: 6000 }),
    lead({ id: 4, source: 'Referral', stage: 'Won', serviceType: 'subscription', estimatedValueDollars: 8000 }),
    lead({ id: 5, source: 'Other', stage: 'Lost', estimatedValueDollars: 3000 }),
    lead({ id: 6, source: 'Instagram DM', stage: 'Discovery Done', serviceType: 'project', estimatedValueDollars: 5200 }),
    lead({ id: 7, source: 'Referral', stage: 'Won', serviceType: 'project', estimatedValueDollars: 12000 }),
  ]
  const events: KpiStageEvent[] = [
    { leadId: 1, toStage: 'Discovery Booked', at: '2026-11-10T15:00:00.000Z' },
    { leadId: 2, toStage: 'New', at: '2026-11-12T15:00:00.000Z' },
    { leadId: 3, toStage: 'New', at: '2026-11-01T15:00:00.000Z' },
    { leadId: 3, toStage: 'Proposal Sent', at: '2026-11-08T15:00:00.000Z' },
    { leadId: 4, toStage: 'Discovery Booked', at: '2026-11-02T15:00:00.000Z' },
    { leadId: 4, toStage: 'Won', at: '2026-11-13T15:00:00.000Z' },
    { leadId: 5, toStage: 'Lost', at: '2026-11-05T15:00:00.000Z' },
    { leadId: 6, toStage: 'Discovery Done', at: '2026-11-09T15:00:00.000Z' },
    { leadId: 7, toStage: 'Won', at: '2026-10-04T15:00:00.000Z' },
  ]

  it('counts lead to discovery to won, overall and by source', () => {
    const overall = conversionSlice(leads, events)
    assert.equal(overall.leads, 7)
    assert.equal(overall.reachedDiscovery, 5)
    assert.equal(overall.won, 2)
    assert.equal(overall.leadToDiscovery, 5 / 7)
    assert.equal(overall.discoveryToWon, 2 / 5)
    assert.equal(overall.leadToWon, 2 / 7)

    const report = computeKpis({
      leads,
      events,
      today: TODAY,
      subscribers: [
        { active: true, monthlyDollars: 5000, remaining: 2, renewalSoon: true },
        { active: false, monthlyDollars: 2800, remaining: 2, renewalSoon: false },
        { active: true, monthlyDollars: null, remaining: 1, renewalSoon: false },
      ],
      appointments: [
        { appointmentType: 'Listing Shoot', startAt: '2026-11-14T16:00:00.000Z', status: 'scheduled' },
        { appointmentType: 'Discovery Call', startAt: '2026-11-14T18:00:00.000Z', status: 'scheduled' },
        { appointmentType: 'Listing Shoot', startAt: '2026-11-07T16:00:00.000Z', status: 'scheduled' },
      ],
      countedTypes: ['Listing Shoot', 'Discovery Call'],
      edits: [
        { status: 'Completed', shotOn: '2026-10-20', completedOn: '2026-10-27' },
        { status: 'Revisions Needed', shotOn: '2026-11-02', completedOn: null },
        { status: 'Not Started', shotOn: null, completedOn: null },
      ],
    })

    const referral = report.conversionBySource.find((row) => row.source === 'Referral')
    assert.ok(referral)
    assert.equal(referral.slice.leads, 3)
    assert.equal(referral.slice.won, 2)
    assert.equal(report.wonThisMonthDollars, 8000)
    assert.equal(report.wonThisMonthCount, 1)
    assert.equal(report.subscriptionWonThisMonthDollars, 8000)
    assert.equal(report.projectWonThisMonthDollars, 0)
    assert.equal(report.recurringDollars, 5000)
    assert.equal(report.revenueTowardTarget, 13000)
    assert.equal(report.targetBand, 'below')
    assert.equal(report.unpricedSubscribers, 1)
    assert.equal(report.averageWonDealDollars, 10000)
    assert.equal(report.wonDealsAtLeast5k, 2)
    assert.equal(report.openDealsAtLeast5k, 2)
    assert.equal(report.pipeline.find((stage) => stage.stage === 'Proposal Sent')?.dollars, 6000)
    assert.equal(report.overdueFollowUps, 0)
    assert.equal(report.editTurnaroundDays, 7)
    assert.equal(report.editTurnaroundSample, 1)
    assert.equal(report.revisionCount, 1)
    assert.equal(report.revisionBase, 2)
    assert.equal(report.renewalsSoon, 1)
    assert.equal(report.inactiveSubscribers, 1)
    assert.equal(report.churnRate, 1 / 3)
    assert.equal(report.unusedShoots, 3)
    assert.equal(report.shootsThisWeek, 1)
    assert.equal(weekStartMonday(TODAY), '2026-11-09')
  })

  it('treats edit metrics as a current-status sample', () => {
    const metrics = editMetrics([
      { status: 'Completed', shotOn: '2026-10-01', completedOn: '2026-10-05' },
      { status: 'Approved', shotOn: '2026-10-01', completedOn: '2026-10-11' },
      { status: 'Client Revision', shotOn: '2026-10-02', completedOn: null },
      { status: 'Uploaded', shotOn: '2026-10-02', completedOn: null },
    ])
    assert.equal(metrics.editTurnaroundSample, 2)
    assert.equal(metrics.editTurnaroundDays, 7)
    assert.equal(metrics.revisionRate, 1 / 3)
  })
})
