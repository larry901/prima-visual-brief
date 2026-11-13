import { addDays, chicagoToday, formatLongDate } from '../portal/cycle'
import { ensureDemoSeed, demoSeedEnabled } from '../portal/seed'
import { getPortalStore } from '../portal/store'
import type { ClientRecord, PortalStore } from '../portal/types'
import { loadPortalView } from '../portal/view'
import { ensureHubDemo } from './demo'
import { monthlyPriceFor } from './money'
import { getHubStore } from './store'
import type { HubStore, LeadRecord, StageEvent, TouchRecord } from './types'
import type { PlanSize } from '../portal/types'
import type { AppointmentRecord } from '../portal/types'

export interface HubClientCard {
  id: number
  name: string
  company: string
  email: string
  kind: ClientRecord['kind']
  active: boolean
  planSize: number | null
  used: number
  remaining: number
  renewalDate: string
  renewalLabel: string
  renewalSoon: boolean
  monthlyDollars: number | null
  priceSource: 'client' | 'plan' | 'unset'
}

export interface HubWorkspace {
  hub: HubStore
  portal: PortalStore
  leads: LeadRecord[]
  events: StageEvent[]
  touches: TouchRecord[]
  clients: ClientRecord[]
  countedTypes: string[]
  planPrices: Partial<Record<PlanSize, number>>
  clientPrices: Map<number, number>
  appointments: AppointmentRecord[]
  now: Date
  demo: boolean
}

export function renewalSoon(renewalDate: string | null, today: string, withinDays = 14): boolean {
  if (!renewalDate) return false
  const horizon = addDays(today, withinDays)
  return renewalDate >= today && renewalDate <= horizon
}

export async function loadWorkspace(now: Date = new Date()): Promise<HubWorkspace> {
  const portal = getPortalStore()
  await portal.ensureReady()
  const hub = getHubStore()
  await hub.ensureReady()
  if (demoSeedEnabled()) {
    await ensureDemoSeed(portal)
    await ensureHubDemo(hub, portal, now)
  }
  const [leads, events, touches, clients, countedTypes, planPrices, clientPrices, appointments] = await Promise.all([
    hub.listLeads(),
    hub.listStageEvents(),
    hub.listTouches(),
    portal.listClients(),
    portal.getCountedTypes(),
    hub.getPlanPrices(),
    hub.getClientPrices(),
    portal.listAppointments(),
  ])
  return {
    hub,
    portal,
    leads,
    events,
    touches,
    clients,
    countedTypes,
    planPrices,
    clientPrices,
    appointments,
    now,
    demo: demoSeedEnabled(),
  }
}

export async function loadClientCards(workspace: HubWorkspace): Promise<HubClientCard[]> {
  const today = chicagoToday(workspace.now)
  const cards = await Promise.all(
    workspace.clients.map(async (client) => {
      const view = await loadPortalView(workspace.portal, client, workspace.now)
      const price = monthlyPriceFor(client, workspace.planPrices, workspace.clientPrices)
      return {
        id: client.id,
        name: client.name,
        company: client.company,
        email: client.email,
        kind: client.kind,
        active: client.active,
        planSize: client.planSize,
        used: view.used,
        remaining: view.remaining,
        renewalDate: view.renewalDate,
        renewalLabel: view.renewalLabel || (view.renewalDate ? formatLongDate(view.renewalDate) : ''),
        renewalSoon: client.kind === 'subscription' && client.active && renewalSoon(view.renewalDate, today),
        monthlyDollars: client.kind === 'subscription' ? price.dollars : null,
        priceSource: client.kind === 'subscription' ? price.source : 'unset',
      } satisfies HubClientCard
    }),
  )
  cards.sort((a, b) => Number(b.renewalSoon) - Number(a.renewalSoon) || a.name.localeCompare(b.name))
  return cards
}
