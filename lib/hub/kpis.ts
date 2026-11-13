import { isDiscoveryAppointmentType } from '../portal/appointment-types'
import {
  addDays,
  chicagoDate,
  isCountedType,
  isIsoDate,
  type ShootAppointment,
} from '../portal/cycle'
import { followUpState } from './followups'
import type { LeadSource, LeadStage, ServiceType } from './types'

/** Staff target for the month. Won deals plus recurring subscription prices. */
export const REVENUE_TARGET = { low: 20_000, high: 25_000 }

const FUNNEL: readonly LeadStage[] = ['New', 'Discovery Booked', 'Discovery Done', 'Proposal Sent', 'Won']

export interface KpiLead {
  id: number
  source: LeadSource
  stage: LeadStage
  serviceType: ServiceType | null
  estimatedValueDollars: number | null
  nextFollowUp: string | null
}

export interface KpiStageEvent {
  leadId: number
  toStage: LeadStage
  at: string
}

export interface KpiSubscriber {
  active: boolean
  monthlyDollars: number | null
  remaining: number
  renewalSoon: boolean
}

export interface KpiEdit {
  status: string | null
  shotOn: string | null
  completedOn: string | null
}

export interface ConversionSlice {
  leads: number
  reachedDiscovery: number
  won: number
  leadToDiscovery: number | null
  discoveryToWon: number | null
  leadToWon: number | null
}

export interface StageValue {
  stage: LeadStage
  count: number
  dollars: number
  unpriced: number
}

export interface KpiReport {
  month: string
  wonThisMonthDollars: number
  wonThisMonthCount: number
  /** Active subscription prices only. Inactive clients are left out. */
  activeRecurringDollars: number
  /** Subscription deals won this month. Their value is monthly, so it is new MRR. */
  newMrrDollars: number
  /** Active subscription prices plus new MRR from subscription deals won this month. */
  recurringDollars: number
  /** One-off deals won this month. One-off projects and won deals are the same entry. */
  oneOffDollars: number
  projectWonThisMonthDollars: number
  subscriptionWonThisMonthDollars: number
  /** Recurring plus one-off. The Stripe seam is this sum. */
  totalDollars: number
  /** Lead wins this month plus deals logged only on KPIs. */
  dealsWonCount: number
  /** Leads marked won this month divided by leads marked won or lost this month. */
  winRate: number | null
  revenueTowardTarget: number
  targetLow: number
  targetHigh: number
  targetBand: 'below' | 'inside' | 'above'
  unpricedSubscribers: number
  conversion: ConversionSlice
  conversionBySource: { source: LeadSource; slice: ConversionSlice }[]
  averageWonDealDollars: number | null
  wonDealsAtLeast5k: number
  openDealsAtLeast5k: number
  pipeline: StageValue[]
  overdueFollowUps: number
  editTurnaroundDays: number | null
  editTurnaroundSample: number
  revisionRate: number | null
  revisionCount: number
  revisionBase: number
  renewalsSoon: number
  inactiveSubscribers: number
  subscriptionClients: number
  churnRate: number | null
  unusedShoots: number
  shootsThisWeek: number
  shootsPriorWeeks: number[]
  averageShootsPerWeek: number | null
  approximateNotes: string[]
}

function stageRank(stage: LeadStage): number | null {
  const index = FUNNEL.indexOf(stage)
  return index === -1 ? null : index
}

function reachedAtLeast(
  lead: KpiLead,
  events: readonly KpiStageEvent[],
  target: LeadStage,
): boolean {
  const targetRank = stageRank(target)
  if (targetRank == null) return false
  const current = stageRank(lead.stage)
  if (current != null && current >= targetRank) return true
  return events.some((event) => event.leadId === lead.id && (stageRank(event.toStage) ?? -1) >= targetRank)
}

export function conversionSlice(leads: readonly KpiLead[], events: readonly KpiStageEvent[]): ConversionSlice {
  let reachedDiscovery = 0
  let won = 0
  for (const lead of leads) {
    const discovery = reachedAtLeast(lead, events, 'Discovery Booked')
    const didWin = reachedAtLeast(lead, events, 'Won')
    if (discovery) reachedDiscovery += 1
    if (didWin) won += 1
  }
  return {
    leads: leads.length,
    reachedDiscovery,
    won,
    leadToDiscovery: leads.length === 0 ? null : reachedDiscovery / leads.length,
    discoveryToWon: reachedDiscovery === 0 ? null : won / reachedDiscovery,
    leadToWon: leads.length === 0 ? null : won / leads.length,
  }
}

function wonAt(lead: KpiLead, events: readonly KpiStageEvent[]): string | null {
  if (lead.stage !== 'Won') return null
  const wins = events
    .filter((event) => event.leadId === lead.id && event.toStage === 'Won')
    .map((event) => event.at)
    .sort()
  return wins[wins.length - 1] ?? null
}

function chicagoMonth(iso: string): string | null {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  const day = chicagoDate(parsed)
  return isIsoDate(day) ? day.slice(0, 7) : null
}

export function weekStartMonday(today: string): string {
  const [year, month, day] = today.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday
  return addDays(today, mondayOffset)
}

function statusKey(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

const COMPLETED_STATUSES = new Set(['completed', 'approved'])
const REVISION_STATUSES = new Set(['client revision', 'revisions needed'])
const NOT_STARTED_STATUSES = new Set(['', 'not started', 'uploaded'])

/** Approximate. Notion only has the current status, Date Shot, and Completed Date. */
export function editMetrics(pages: readonly KpiEdit[]): {
  editTurnaroundDays: number | null
  editTurnaroundSample: number
  revisionRate: number | null
  revisionCount: number
  revisionBase: number
} {
  const samples: number[] = []
  let revisionCount = 0
  let revisionBase = 0
  for (const page of pages) {
    const key = statusKey(page.status)
    if (!NOT_STARTED_STATUSES.has(key)) {
      revisionBase += 1
      if (REVISION_STATUSES.has(key)) revisionCount += 1
    }
    if (!COMPLETED_STATUSES.has(key) || !page.shotOn || !page.completedOn) continue
    if (!isIsoDate(page.shotOn) || !isIsoDate(page.completedOn)) continue
    const [y1, m1, d1] = page.shotOn.split('-').map(Number)
    const [y2, m2, d2] = page.completedOn.split('-').map(Number)
    const days = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
    if (days >= 0 && days < 365) samples.push(days)
  }
  const total = samples.reduce((sum, days) => sum + days, 0)
  return {
    editTurnaroundDays: samples.length === 0 ? null : total / samples.length,
    editTurnaroundSample: samples.length,
    revisionRate: revisionBase === 0 ? null : revisionCount / revisionBase,
    revisionCount,
    revisionBase,
  }
}

export function shootsOnDates(
  appointments: readonly ShootAppointment[],
  countedTypes: readonly string[],
  startDate: string,
  endDate: string,
): number {
  return appointments.filter((appointment) => {
    if (appointment.needsReview) return false
    if (appointment.status === 'cancelled') return false
    if (isDiscoveryAppointmentType(appointment.appointmentType)) return false
    if (!isCountedType(appointment.appointmentType, [...countedTypes])) return false
    const parsed = new Date(appointment.startAt)
    if (Number.isNaN(parsed.getTime())) return false
    const day = chicagoDate(parsed)
    return day >= startDate && day <= endDate
  }).length
}

export interface KpiDirectDeal {
  serviceType: ServiceType
  amountDollars: number
  wonOn: string
}

export interface KpiInput {
  leads: readonly KpiLead[]
  events: readonly KpiStageEvent[]
  today: string
  subscribers: readonly KpiSubscriber[]
  appointments: readonly ShootAppointment[]
  countedTypes: readonly string[]
  edits: readonly KpiEdit[]
  /** Deals logged on KPIs that were never leads. */
  directDeals?: readonly KpiDirectDeal[]
}

/**
 * Monthly revenue toward the target.
 * Recurring is staff-entered active subscription prices plus subscription deals
 * won this month (new MRR). One-off revenue is one-off deals won this month.
 * A later phase should fill active prices from Stripe. This function does not.
 */
export function computeKpis(input: KpiInput): KpiReport {
  const month = input.today.slice(0, 7)
  let wonThisMonthDollars = 0
  let wonThisMonthCount = 0
  let projectWonThisMonthDollars = 0
  let subscriptionWonThisMonthDollars = 0
  let newMrrDollars = 0
  let oneOffDollars = 0
  let dealsWonCount = 0
  let wonLeadsThisMonth = 0
  let lostLeadsThisMonth = 0
  const wonValues: number[] = []
  let wonDealsAtLeast5k = 0
  let openDealsAtLeast5k = 0

  for (const lead of input.leads) {
    const value = lead.estimatedValueDollars
    if (lead.stage === 'Won' && value != null) {
      wonValues.push(value)
      if (value >= 5_000) wonDealsAtLeast5k += 1
    }
    if (lead.stage !== 'Won' && lead.stage !== 'Lost' && value != null && value >= 5_000) {
      openDealsAtLeast5k += 1
    }
    if (lead.stage === 'Lost') {
      const losses = input.events
        .filter((event) => event.leadId === lead.id && event.toStage === 'Lost')
        .map((event) => event.at)
        .sort()
      const lostAt = losses[losses.length - 1]
      if (lostAt && chicagoMonth(lostAt) === month) lostLeadsThisMonth += 1
    }
    const at = wonAt(lead, input.events)
    if (!at || chicagoMonth(at) !== month) continue
    dealsWonCount += 1
    wonLeadsThisMonth += 1
    if (value == null) continue
    wonThisMonthDollars += value
    wonThisMonthCount += 1
    if (lead.serviceType === 'subscription') {
      subscriptionWonThisMonthDollars += value
      newMrrDollars += value
    } else if (lead.serviceType === 'project') {
      projectWonThisMonthDollars += value
      oneOffDollars += value
    }
  }

  for (const deal of input.directDeals ?? []) {
    if (!isIsoDate(deal.wonOn) || deal.wonOn.slice(0, 7) !== month) continue
    dealsWonCount += 1
    if (deal.serviceType === 'subscription') newMrrDollars += deal.amountDollars
    else if (deal.serviceType === 'project') oneOffDollars += deal.amountDollars
  }

  let activeRecurringDollars = 0
  let unpricedSubscribers = 0
  let renewalsSoon = 0
  let inactiveSubscribers = 0
  let unusedShoots = 0
  for (const subscriber of input.subscribers) {
    if (!subscriber.active) {
      inactiveSubscribers += 1
      continue
    }
    if (subscriber.monthlyDollars == null) unpricedSubscribers += 1
    else activeRecurringDollars += subscriber.monthlyDollars
    if (subscriber.renewalSoon) renewalsSoon += 1
    unusedShoots += Math.max(0, subscriber.remaining)
  }

  const recurringDollars = activeRecurringDollars + newMrrDollars
  const totalDollars = recurringDollars + oneOffDollars
  const winRate =
    wonLeadsThisMonth + lostLeadsThisMonth === 0
      ? null
      : wonLeadsThisMonth / (wonLeadsThisMonth + lostLeadsThisMonth)
  const revenueTowardTarget = totalDollars
  const targetBand =
    revenueTowardTarget < REVENUE_TARGET.low ? 'below' : revenueTowardTarget > REVENUE_TARGET.high ? 'above' : 'inside'

  const pipelineStages: LeadStage[] = ['New', 'Discovery Booked', 'Discovery Done', 'Proposal Sent']
  const pipeline: StageValue[] = pipelineStages.map((stage) => {
    const rows = input.leads.filter((lead) => lead.stage === stage)
    return {
      stage,
      count: rows.length,
      dollars: rows.reduce((sum, lead) => sum + (lead.estimatedValueDollars ?? 0), 0),
      unpriced: rows.filter((lead) => lead.estimatedValueDollars == null).length,
    }
  })

  const bySource = new Map<LeadSource, KpiLead[]>()
  for (const lead of input.leads) {
    const list = bySource.get(lead.source) ?? []
    list.push(lead)
    bySource.set(lead.source, list)
  }
  const conversionBySource = Array.from(bySource.entries())
    .map(([source, leads]) => ({ source, slice: conversionSlice(leads, input.events) }))
    .sort((a, b) => b.slice.leads - a.slice.leads || a.source.localeCompare(b.source))

  const edits = editMetrics(input.edits)
  const thisMonday = weekStartMonday(input.today)
  const thisSunday = addDays(thisMonday, 6)
  const shootsThisWeek = shootsOnDates(input.appointments, input.countedTypes, thisMonday, thisSunday)
  const shootsPriorWeeks = [1, 2, 3].map((weeksAgo) => {
    const start = addDays(thisMonday, -7 * weeksAgo)
    return shootsOnDates(input.appointments, input.countedTypes, start, addDays(start, 6))
  })
  const weekCounts = [shootsThisWeek, ...shootsPriorWeeks]
  const subscriptionClients = input.subscribers.length

  return {
    month,
    wonThisMonthDollars,
    wonThisMonthCount,
    activeRecurringDollars,
    newMrrDollars,
    recurringDollars,
    oneOffDollars,
    projectWonThisMonthDollars,
    subscriptionWonThisMonthDollars,
    totalDollars,
    dealsWonCount,
    winRate,
    revenueTowardTarget,
    targetLow: REVENUE_TARGET.low,
    targetHigh: REVENUE_TARGET.high,
    targetBand,
    unpricedSubscribers,
    conversion: conversionSlice(input.leads, input.events),
    conversionBySource,
    averageWonDealDollars:
      wonValues.length === 0 ? null : wonValues.reduce((sum, value) => sum + value, 0) / wonValues.length,
    wonDealsAtLeast5k,
    openDealsAtLeast5k,
    pipeline,
    overdueFollowUps: input.leads.filter((lead) => followUpState(lead, input.today) === 'overdue').length,
    ...edits,
    renewalsSoon,
    inactiveSubscribers,
    subscriptionClients,
    churnRate: subscriptionClients === 0 ? null : inactiveSubscribers / subscriptionClients,
    unusedShoots,
    shootsThisWeek,
    shootsPriorWeeks,
    averageShootsPerWeek: weekCounts.reduce((sum, count) => sum + count, 0) / weekCounts.length,
    approximateNotes: [
      'Recurring revenue is active subscription prices plus subscription deals won this month. Those deals are new MRR. Inactive clients are left out. A subscription deal and a client price for the same person can both be counted until Stripe replaces the staff-entered prices.',
      'One-off revenue is one-off deals won this month. Logging a won deal is the only way a project enters that number. Stripe is a later phase.',
      'Win rate is leads marked won this month divided by leads marked won or lost this month. A deal logged only on KPIs counts in revenue and deals won, not in the rate.',
      'Conversion uses stage changes stored in the hub. Leads from before this install are not backfilled. A deal marked Won counts as having reached discovery.',
      'Edit turnaround is the average of Notion Date Shot to Completed Date on rows whose status is Completed or Approved. Revision rate only sees the current status, so a video that was revised and then completed is not counted.',
      'Subscriber churn is the share of subscription clients marked inactive. There is no cancellation date.',
      'Shoots per week count ingested appointments whose type is in Shoots that count. Discovery calls are excluded. History only exists for appointments the bot has posted.',
    ],
  }
}
