import type { ClientKind } from './types'

/** Staff roster tabs. Subscribers is the default when the query param is missing or unknown. */
export type RosterView = 'subscribers' | 'project'

export const ROSTER_VIEW_OPTIONS: readonly { view: RosterView; label: string }[] = [
  { view: 'subscribers', label: 'Subscribers' },
  { view: 'project', label: 'Per-Project' },
]

const PROJECT_QUERY_VALUES = new Set(['project', 'per-project', 'perproject'])

export function parseRosterView(value: string | string[] | null | undefined): RosterView {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return 'subscribers'
  const normalized = raw.trim().toLowerCase().replace(/[\s_]+/g, '-')
  if (PROJECT_QUERY_VALUES.has(normalized)) return 'project'
  return 'subscribers'
}

export function rosterViewHref(view: RosterView): string {
  return `/dashboard/clients?view=${view}`
}

export function kindForRosterView(view: RosterView): ClientKind {
  return view === 'project' ? 'project' : 'subscription'
}

export function filterClientsByRosterView<T extends { kind: string }>(
  clients: readonly T[],
  view: RosterView,
): T[] {
  const kind = kindForRosterView(view)
  return clients.filter((client) => client.kind === kind)
}

export function countClientsByRosterView(clients: readonly { kind: string }[]): Record<RosterView, number> {
  let subscribers = 0
  let project = 0
  for (const client of clients) {
    if (client.kind === 'subscription') subscribers += 1
    else if (client.kind === 'project') project += 1
  }
  return { subscribers, project }
}

/** Plan size, renewal, and shoots left only belong on the subscribers tab. */
export function rosterViewShowsSubscriptionColumns(view: RosterView): boolean {
  return view === 'subscribers'
}

export interface RosterPlanSummary {
  planLine: string
  renewalLine: string
  missingSchedulingLink: boolean
}

export function rosterPlanSummary(
  client: {
    kind: string
    planSize: number | null
    remaining: number
    renewalLabel: string
    missingSchedulingLink: boolean
  },
  view: RosterView,
): RosterPlanSummary | null {
  if (!rosterViewShowsSubscriptionColumns(view)) return null
  if (client.kind !== 'subscription') return null
  return {
    planLine: `${client.planSize}/month · ${client.remaining} left`,
    renewalLine: `Renews ${client.renewalLabel}`,
    missingSchedulingLink: client.missingSchedulingLink,
  }
}

export function rosterEmptyMessage(view: RosterView, totalClients: number): string {
  if (totalClients === 0) return 'No clients yet.'
  return view === 'project' ? 'No per-project clients yet.' : 'No subscribers yet.'
}
