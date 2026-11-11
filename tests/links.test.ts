import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MemoryStore } from '../lib/portal/memory-store'
import { GENERIC_SCHEDULER, bookingUrl, withClientPrefill } from '../lib/portal/links'
import { loadPortalView } from '../lib/portal/view'

describe('scheduling URL merge', () => {
  it('appends name and email when the link has no question mark', () => {
    const url = new URL(withClientPrefill('https://example.com/schedule/maya', 'Maya Chen', 'maya.chen@example.com'))
    assert.equal(`${url.origin}${url.pathname}`, 'https://example.com/schedule/maya')
    assert.equal(url.searchParams.get('firstName'), 'Maya')
    assert.equal(url.searchParams.get('lastName'), 'Chen')
    assert.equal(url.searchParams.get('email'), 'maya.chen@example.com')
  })

  it('keeps the package code when the link already has a query string', () => {
    const url = new URL(
      withClientPrefill(
        'https://example.com/schedule/maya?certificate=EXAMPLE-CODE&owner=42',
        'Maya Chen',
        'maya.chen@example.com',
      ),
    )
    assert.equal(url.searchParams.get('certificate'), 'EXAMPLE-CODE')
    assert.equal(url.searchParams.get('owner'), '42')
    assert.equal(url.searchParams.get('firstName'), 'Maya')
    assert.equal(url.searchParams.get('email'), 'maya.chen@example.com')
  })

  it('keeps a hash and an encoded code', () => {
    const url = new URL(
      withClientPrefill('https://example.com/book?certificate=PKG%2F1#details', 'Ada Lovelace', 'ada@example.com'),
    )
    assert.equal(url.searchParams.get('certificate'), 'PKG/1')
    assert.equal(url.hash, '#details')
    assert.equal(url.searchParams.get('firstName'), 'Ada')
    assert.equal(url.searchParams.get('lastName'), 'Lovelace')
  })

  it('refreshes name and email without removing the code or repeated params', () => {
    const url = new URL(
      withClientPrefill(
        'https://example.com/schedule?certificate=EXAMPLE-CODE&firstName=Old&email=old@example.com&appointmentType[]=1&appointmentType[]=2',
        'Maya Chen',
        'maya.chen@example.com',
      ),
    )
    assert.equal(url.searchParams.get('certificate'), 'EXAMPLE-CODE')
    assert.deepEqual(url.searchParams.getAll('appointmentType[]'), ['1', '2'])
    assert.equal(url.searchParams.get('firstName'), 'Maya')
    assert.equal(url.searchParams.get('email'), 'maya.chen@example.com')
  })

  it('sends per-project clients to the public scheduler', () => {
    const url = bookingUrl({
      kind: 'project',
      schedulingLink: 'https://example.com/private?certificate=SHOULD-NOT-USE',
      name: 'Andre Walsh',
      email: 'andre.walsh@example.com',
    })
    assert.ok(url)
    const parsed = new URL(url)
    const generic = new URL(GENERIC_SCHEDULER)
    assert.equal(`${parsed.origin}${parsed.pathname}`, `${generic.origin}${generic.pathname}`)
    assert.equal(parsed.searchParams.get('certificate'), null)
    assert.equal(parsed.searchParams.get('firstName'), 'Andre')
    assert.equal(parsed.searchParams.get('email'), 'andre.walsh@example.com')
  })

  it('does not fall back to the paid scheduler when a subscription link is missing or invalid', () => {
    const base = { kind: 'subscription' as const, name: 'Priya Nair', email: 'priya.nair@example.com' }
    assert.equal(bookingUrl({ ...base, schedulingLink: null }), null)
    assert.equal(bookingUrl({ ...base, schedulingLink: '   ' }), null)
    assert.equal(bookingUrl({ ...base, schedulingLink: 'not a url' }), null)
  })

  it('uses only the subscription link, with the code still attached', () => {
    const url = bookingUrl({
      kind: 'subscription',
      schedulingLink: 'https://example.com/schedule/private?certificate=EXAMPLE-CODE',
      name: 'Maya Chen',
      email: 'maya.chen@example.com',
    })
    assert.ok(url)
    const parsed = new URL(url)
    assert.equal(parsed.hostname, 'example.com')
    assert.notEqual(parsed.hostname, 'primavisual.as.me')
    assert.equal(parsed.searchParams.get('certificate'), 'EXAMPLE-CODE')
    assert.equal(parsed.searchParams.get('firstName'), 'Maya')
  })
})

describe('portal booking by client type', () => {
  it('hides the plan for a per-project client and does not expose a private link', async () => {
    const store = new MemoryStore()
    const client = await store.createClient({
      name: 'Andre Walsh',
      email: 'andre.walsh@example.com',
      company: 'Walsh Group',
      kind: 'project',
      planSize: null,
      renewalDate: null,
      schedulingLink: 'https://example.com/private?certificate=EXAMPLE-CODE',
      active: true,
      frameioUrl: null,
    })
    const view = await loadPortalView(store, client, new Date('2026-11-11T18:00:00.000Z'))
    assert.equal(view.showPlan, false)
    assert.equal(view.planSize, null)
    assert.ok(view.bookingUrl)
    assert.equal(new URL(view.bookingUrl).hostname, 'primavisual.as.me')
    assert.equal(view.bookingUrl.includes('EXAMPLE-CODE'), false)
  })

  it('keeps the plan and withholds the scheduler when a subscription link is missing', async () => {
    const store = new MemoryStore()
    const client = await store.createClient({
      name: 'Priya Nair',
      email: 'priya.nair@example.com',
      company: 'Nair Homes',
      kind: 'subscription',
      planSize: 2,
      renewalDate: '2026-12-21',
      schedulingLink: null,
      active: true,
      frameioUrl: null,
    })
    const view = await loadPortalView(store, client, new Date('2026-11-11T18:00:00.000Z'))
    assert.equal(view.showPlan, true)
    assert.equal(view.planSize, 2)
    assert.equal(view.bookingUrl, null)
    assert.ok(view.renewalLabel)
  })
})
