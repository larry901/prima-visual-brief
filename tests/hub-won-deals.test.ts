import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MemoryHubStore } from '../lib/hub/memory-store'
import { parseWonDeal } from '../lib/hub/won-deals'

describe('log won deal', () => {
  it('accepts a one-off or a monthly subscription and rejects a blank amount', () => {
    const project = parseWonDeal({
      name: 'Walsh Group',
      serviceType: 'project',
      amountDollars: '1500',
      wonOn: '2026-11-10',
    })
    assert.equal(project.ok, true)
    if (project.ok) {
      assert.equal(project.value.serviceType, 'project')
      assert.equal(project.value.amountDollars, 1500)
    }
    const monthly = parseWonDeal({
      name: 'Harbor',
      service_type: 'subscription',
      amount: '$700',
      won_on: '2026-11-11',
    })
    assert.equal(monthly.ok, true)
    if (monthly.ok) assert.equal(monthly.value.amountDollars, 700)
    assert.equal(parseWonDeal({ name: 'Harbor', serviceType: 'project', amountDollars: '', wonOn: '2026-11-11' }).ok, false)
    assert.equal(parseWonDeal({ name: '', serviceType: 'project', amountDollars: 10, wonOn: '2026-11-11' }).ok, false)
  })

  it('stores a standalone deal without creating a lead', async () => {
    const hub = new MemoryHubStore()
    const deal = await hub.createWonDeal({
      name: 'Walsh Group',
      serviceType: 'project',
      amountDollars: 1500,
      wonOn: '2026-11-10',
    })
    assert.equal(deal.id, 1)
    assert.equal((await hub.listLeads()).length, 0)
    assert.equal((await hub.listWonDeals())[0]?.name, 'Walsh Group')
  })
})
