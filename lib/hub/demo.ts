import { addDays, chicagoToday } from '../portal/cycle'
import { demoSeedEnabled } from '../portal/seed'
import type { PortalStore } from '../portal/types'
import type { HubStore } from './types'

const MARKER = 'avery.cole@example.com'

/**
 * Fictional hub rows for local preview and screenshots.
 * Runs only when PORTAL_DEMO_SEED=true. Addresses are @example.com.
 * Dollar amounts here are placeholders, not Prima Visual's prices.
 */
export async function ensureHubDemo(hub: HubStore, portal: PortalStore, now: Date = new Date()): Promise<void> {
  if (!demoSeedEnabled()) return
  const today = chicagoToday(now)
  const existing = await hub.listLeads()
  if (!existing.some((lead) => lead.email === MARKER)) {
    await hub.createLead(
      {
        name: 'Avery Cole',
        email: MARKER,
        phone: '713-555-0141',
        company: 'Cole & Pine',
        source: 'Referral',
        referredBy: 'Sam Ortiz',
        stage: 'Discovery Booked',
        serviceType: 'subscription',
        estimatedValueDollars: 4500,
        notes: 'Referred after a listing on Yale. Wants a 2-shoot month.',
        nextFollowUp: today,
        discoveryStartAt: new Date(now.getTime() + 26 * 60 * 60 * 1000).toISOString(),
        discoveryStatus: 'scheduled',
      },
      now,
    )
    await hub.createLead(
      {
        name: 'Blake Nguyen',
        email: 'blake.nguyen@example.com',
        phone: '',
        company: '',
        source: 'Instagram DM',
        stage: 'New',
        notes: 'DM about a listing video. Asked them for a time this week.',
        nextFollowUp: addDays(today, -1),
      },
      now,
    )
    await hub.createLead(
      {
        name: 'Casey Ortiz',
        email: 'casey.ortiz@example.com',
        phone: '713-555-0177',
        company: 'Ortiz Homes',
        source: 'Website form',
        stage: 'Proposal Sent',
        serviceType: 'project',
        estimatedValueDollars: 6000,
        notes: 'Asked for a one-time shoot and a social cut.',
        nextFollowUp: addDays(today, 3),
      },
      now,
    )
    const dana = await hub.createLead(
      {
        name: 'Dana Brooks',
        email: 'dana.brooks@example.com',
        company: 'Brooks Realty',
        source: 'Referral',
        referredBy: 'Maya Chen',
        stage: 'Discovery Booked',
        serviceType: 'subscription',
        estimatedValueDollars: 8000,
        nextFollowUp: null,
      },
      now,
    )
    await hub.updateLead(dana.id, { stage: 'Won' }, now)
    await hub.createLead(
      {
        name: 'Evan Park',
        email: 'evan.park@example.com',
        company: 'Park Group',
        source: 'Other',
        stage: 'Lost',
        estimatedValueDollars: 3000,
        lostReason: 'Went with another studio',
        notes: 'Polite pass after the first call.',
      },
      now,
    )
    await hub.createLead(
      {
        name: 'Fran Adeyemi',
        email: 'fran.adeyemi@example.com',
        company: 'Adeyemi Co',
        source: 'Instagram DM',
        stage: 'Discovery Done',
        serviceType: 'project',
        estimatedValueDollars: 5200,
        notes: 'Discovery went well. Waiting on the property list.',
        nextFollowUp: addDays(today, 2),
      },
      now,
    )
    const past = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000)
    const harper = await hub.createLead(
      {
        name: 'Harper Diaz',
        email: 'harper.diaz@example.com',
        company: 'Diaz Estates',
        source: 'Referral',
        referredBy: 'Andre Walsh',
        stage: 'Discovery Booked',
        serviceType: 'project',
        estimatedValueDollars: 12000,
      },
      past,
    )
    await hub.updateLead(harper.id, { stage: 'Won' }, past)
  }

  const prices = await hub.getPlanPrices()
  if (prices[1] == null) await hub.setPlanPrice(1, 1500)
  if (prices[2] == null) await hub.setPlanPrice(2, 2800)
  if (prices[4] == null) await hub.setPlanPrice(4, 4800)
  const maya = await portal.findClientByEmail('maya.chen@example.com')
  const overrides = await hub.getClientPrices()
  if (maya && !overrides.has(maya.id)) await hub.setClientPrice(maya.id, 5000)
}
