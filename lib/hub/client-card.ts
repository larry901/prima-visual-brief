import type { ClientKind, PlanSize } from '../portal/types'

export interface HubClientCard {
  id: number
  name: string
  company: string
  email: string
  additionalEmails: string[]
  kind: ClientKind
  active: boolean
  planSize: PlanSize | null
  used: number
  remaining: number
  renewalDate: string
  renewalLabel: string
  renewalSoon: boolean
  schedulingLink: string | null
  frameioUrl: string | null
  notionClientId: string | null
  monthlyDollars: number | null
  priceSource: 'client' | 'plan' | 'unset'
}

/** Active subscribers and projects stay in their lists. Inactive clients are separate. */
export function partitionClients(cards: readonly HubClientCard[]): {
  subscribers: HubClientCard[]
  projects: HubClientCard[]
  inactive: HubClientCard[]
} {
  const subscribers: HubClientCard[] = []
  const projects: HubClientCard[] = []
  const inactive: HubClientCard[] = []
  for (const client of cards) {
    if (!client.active) inactive.push(client)
    else if (client.kind === 'subscription') subscribers.push(client)
    else projects.push(client)
  }
  inactive.sort((a, b) => a.name.localeCompare(b.name))
  return { subscribers, projects, inactive }
}
