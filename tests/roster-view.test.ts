import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  countClientsByRosterView,
  filterClientsByRosterView,
  parseRosterView,
  rosterEmptyMessage,
  rosterPlanSummary,
  rosterViewHref,
  rosterViewShowsSubscriptionColumns,
} from '../lib/portal/roster-view'

const roster = [
  { id: 1, name: 'Casey Example', kind: 'subscription', planSize: 2, remaining: 1, renewalLabel: 'Dec 1', missingSchedulingLink: false },
  { id: 2, name: 'Jordan Example', kind: 'project', planSize: null, remaining: 0, renewalLabel: '', missingSchedulingLink: false },
  { id: 3, name: 'Riley Example', kind: 'subscription', planSize: 4, remaining: 4, renewalLabel: 'Jan 2', missingSchedulingLink: true },
  { id: 4, name: 'Avery Example', kind: 'project', planSize: null, remaining: 0, renewalLabel: '', missingSchedulingLink: false },
]

describe('roster view query', () => {
  it('defaults to subscribers and accepts the per-project param', () => {
    assert.equal(parseRosterView(undefined), 'subscribers')
    assert.equal(parseRosterView(null), 'subscribers')
    assert.equal(parseRosterView(''), 'subscribers')
    assert.equal(parseRosterView('subscribers'), 'subscribers')
    assert.equal(parseRosterView('nope'), 'subscribers')
    assert.equal(parseRosterView(['project', 'subscribers']), 'project')
    assert.equal(parseRosterView(' project '), 'project')
    assert.equal(parseRosterView('per-project'), 'project')
    assert.equal(parseRosterView('perproject'), 'project')
    assert.equal(rosterViewHref('subscribers'), '/dashboard/clients?view=subscribers')
    assert.equal(rosterViewHref('project'), '/dashboard/clients?view=project')
  })
})

describe('roster split', () => {
  it('keeps subscribers and per-project clients in separate lists and counts both', () => {
    assert.deepEqual(
      filterClientsByRosterView(roster, 'subscribers').map((client) => client.name),
      ['Casey Example', 'Riley Example'],
    )
    assert.deepEqual(
      filterClientsByRosterView(roster, 'project').map((client) => client.name),
      ['Jordan Example', 'Avery Example'],
    )
    assert.deepEqual(countClientsByRosterView(roster), { subscribers: 2, project: 2 })
    assert.deepEqual(countClientsByRosterView([]), { subscribers: 0, project: 0 })
    assert.equal(rosterEmptyMessage('subscribers', 0), 'No clients yet.')
    assert.equal(rosterEmptyMessage('project', 3), 'No per-project clients yet.')
    assert.equal(rosterEmptyMessage('subscribers', 3), 'No subscribers yet.')
  })

  it('hides plan size, renewal, and shoots left on the per-project view', () => {
    const subscriber = roster[0]
    assert.equal(rosterViewShowsSubscriptionColumns('project'), false)
    assert.equal(rosterPlanSummary(subscriber, 'project'), null)
    assert.equal(rosterPlanSummary(roster[1], 'subscribers'), null)
    assert.deepEqual(rosterPlanSummary(subscriber, 'subscribers'), {
      planLine: '2/month · 1 left',
      renewalLine: 'Renews Dec 1',
      missingSchedulingLink: false,
    })
    assert.equal(rosterPlanSummary(roster[2], 'subscribers')?.missingSchedulingLink, true)
    assert.equal(rosterViewShowsSubscriptionColumns('subscribers'), true)
  })
})
