import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { followUpState, isFollowUpDue, selectDueFollowUps, snoozeFollowUp, suggestedFollowUpText } from '../lib/hub/followups'
import { notifyDueFollowUps, setFollowUpPushSender } from '../lib/hub/push'
import { buildTodayModel, orderTodaySections } from '../lib/hub/today'
import type { LeadRecord } from '../lib/hub/types'
import type { AppointmentRecord } from '../lib/portal/types'

const TODAY = '2026-11-13'
const NOW = new Date('2026-11-13T18:00:00.000Z')

function lead(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: 1,
    name: 'Avery Cole',
    company: 'Cole & Pine',
    email: 'avery.cole@example.com',
    phone: '',
    source: 'Referral',
    referredBy: 'Sam Ortiz',
    stage: 'New',
    estimatedValueDollars: null,
    serviceType: null,
    notes: '',
    nextFollowUp: null,
    lostReason: '',
    acuityAppointmentId: null,
    discoveryStartAt: null,
    discoveryStatus: null,
    convertedClientId: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  }
}

function appointment(overrides: Partial<AppointmentRecord> = {}): AppointmentRecord {
  return {
    id: 1,
    clientId: 1,
    acuityAppointmentId: 'apt-1',
    appointmentType: 'Listing Shoot',
    startAt: '2026-11-14T16:00:00.000Z',
    status: 'scheduled',
    source: 'acuity_email',
    clientEmail: 'maya.chen@example.com',
    clientName: 'Maya Chen',
    rawSubject: null,
    needsReview: false,
    reviewReason: null,
    ...overrides,
  }
}

describe('follow-up due logic', () => {
  it('marks open leads due today or overdue, and ignores closed leads and empty dates', () => {
    assert.equal(followUpState(lead({ nextFollowUp: '2026-11-12' }), TODAY), 'overdue')
    assert.equal(followUpState(lead({ nextFollowUp: TODAY }), TODAY), 'due')
    assert.equal(followUpState(lead({ nextFollowUp: '2026-11-16' }), TODAY), 'upcoming')
    assert.equal(followUpState(lead({ nextFollowUp: null }), TODAY), 'none')
    assert.equal(followUpState(lead({ stage: 'Won', nextFollowUp: '2026-11-01' }), TODAY), 'none')
    assert.equal(followUpState(lead({ stage: 'Lost', nextFollowUp: '2026-11-01' }), TODAY), 'none')
    assert.equal(isFollowUpDue(lead({ nextFollowUp: '2026-11-12' }), TODAY), true)
    assert.equal(isFollowUpDue(lead({ nextFollowUp: '2026-11-20' }), TODAY), false)
  })

  it('sorts overdue ahead of due, oldest first', () => {
    const notices = selectDueFollowUps(
      [
        lead({ id: 2, name: 'Blake Nguyen', nextFollowUp: TODAY }),
        lead({ id: 3, name: 'Casey Ortiz', nextFollowUp: '2026-11-10' }),
        lead({ id: 4, name: 'Dana Brooks', stage: 'Won', nextFollowUp: '2026-11-01' }),
        lead({ id: 5, name: 'Evan Park', nextFollowUp: '2026-11-11' }),
      ],
      TODAY,
    )
    assert.deepEqual(
      notices.map((notice) => [notice.leadId, notice.overdue]),
      [
        [3, true],
        [5, true],
        [2, false],
      ],
    )
  })

  it('snoozes from today in Chicago, not from the old date', () => {
    assert.equal(snoozeFollowUp(TODAY, 'tomorrow'), '2026-11-14')
    assert.equal(snoozeFollowUp(TODAY, '3days'), '2026-11-16')
    assert.equal(snoozeFollowUp(TODAY, 'week'), '2026-11-20')
  })

  it('suggests text the staff copy themselves', () => {
    const text = suggestedFollowUpText(lead({ name: 'Avery Cole', stage: 'Proposal Sent', source: 'Referral' }))
    assert.match(text, /Avery/)
    assert.match(text, /proposal/i)
    assert.equal(text.includes('http'), false)
  })

  it('leaves the push hook unused until a sender is registered', async () => {
    await notifyDueFollowUps([{ leadId: 1, name: 'Avery Cole', dueOn: TODAY, overdue: false }])
    const seen: unknown[] = []
    setFollowUpPushSender(async (notices) => {
      seen.push(notices)
    })
    await notifyDueFollowUps([{ leadId: 1, name: 'Avery Cole', dueOn: TODAY, overdue: true }])
    setFollowUpPushSender(null)
    assert.equal(seen.length, 1)
  })
})

describe('today model', () => {
  it('separates due follow-ups, upcoming discovery calls, and this week’s shoots', () => {
    const model = buildTodayModel({
      now: NOW,
      countedTypes: ['Listing Shoot', 'Discovery Call'],
      leads: [
        lead({ id: 1, nextFollowUp: '2026-11-12', stage: 'Discovery Booked' }),
        lead({
          id: 2,
          name: 'Blake Nguyen',
          email: 'blake.nguyen@example.com',
          stage: 'Discovery Booked',
          nextFollowUp: '2026-11-20',
          discoveryStartAt: '2026-11-18T16:00:00.000Z',
          discoveryStatus: 'scheduled',
          acuityAppointmentId: 'disc-blake',
        }),
      ],
      appointments: [
        appointment({ id: 10, startAt: '2026-11-13T20:00:00.000Z' }),
        appointment({ id: 11, startAt: '2026-11-14T16:00:00.000Z' }),
        appointment({ id: 12, startAt: '2026-11-18T16:00:00.000Z' }),
        appointment({
          id: 13,
          appointmentType: 'Discovery Call',
          acuityAppointmentId: 'disc-maya',
          startAt: '2026-11-14T21:00:00.000Z',
          clientName: 'Maya Chen',
        }),
        appointment({
          id: 14,
          appointmentType: 'Discovery Call',
          status: 'cancelled',
          startAt: '2026-11-15T16:00:00.000Z',
        }),
      ],
    })
    assert.equal(model.today, TODAY)
    assert.equal(model.weekStart, '2026-11-09')
    assert.equal(model.weekEnd, '2026-11-15')
    assert.deepEqual(model.followUps.map((item) => item.leadId), [1])
    assert.equal(model.shootsToday.length, 1)
    assert.equal(model.shootsToday[0].id, 10)
    assert.deepEqual(model.shootsLaterThisWeek.map((shoot) => shoot.id), [11])
    assert.equal(model.discoveries.some((call) => call.name === 'Maya Chen'), true)
    assert.equal(model.discoveries.some((call) => call.leadId === 2), true)
    assert.equal(model.discoveries.some((call) => call.status === 'cancelled'), false)
    assert.equal(
      model.shootsToday.concat(model.shootsLaterThisWeek).some((shoot) => shoot.type === 'Discovery Call'),
      false,
    )
  })

  it('puts empty sections after shoots, discovery calls, and follow-ups', () => {
    assert.deepEqual(
      orderTodaySections([
        { id: 'followUps', populated: true },
        { id: 'discoveries', populated: false },
        { id: 'shoots', populated: true },
      ]).map((section) => section.id),
      ['shoots', 'followUps', 'discoveries'],
    )
    assert.deepEqual(
      orderTodaySections([
        { id: 'followUps', populated: false },
        { id: 'discoveries', populated: false },
        { id: 'shoots', populated: false },
      ]).map((section) => section.id),
      ['shoots', 'discoveries', 'followUps'],
    )
  })
})
