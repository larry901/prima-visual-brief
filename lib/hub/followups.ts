import { addDays, chicagoDate, chicagoToday, isIsoDate } from '../portal/cycle'
import { calendarDaysBetween } from '../portal/video-progress'
import { isOpenStage, type LeadRecord, type LeadSource, type LeadStage, type SnoozePreset } from './types'

export type FollowUpState = 'overdue' | 'due' | 'upcoming' | 'none'

/** Open leads with a follow-up on or before today are due. Closed leads are not. */
export function followUpState(
  lead: { stage: LeadStage; nextFollowUp: string | null },
  today: string,
): FollowUpState {
  if (!isOpenStage(lead.stage)) return 'none'
  if (!lead.nextFollowUp || !isIsoDate(lead.nextFollowUp) || !isIsoDate(today)) return 'none'
  if (lead.nextFollowUp < today) return 'overdue'
  if (lead.nextFollowUp === today) return 'due'
  return 'upcoming'
}

export function isFollowUpDue(
  lead: { stage: LeadStage; nextFollowUp: string | null },
  today: string,
): boolean {
  const state = followUpState(lead, today)
  return state === 'due' || state === 'overdue'
}

export function snoozeDays(preset: SnoozePreset): number {
  if (preset === 'tomorrow') return 1
  if (preset === '3days') return 3
  return 7
}

/** The next follow-up date when staff snoozes from today in America/Chicago. */
export function snoozeFollowUp(today: string, preset: SnoozePreset): string {
  return addDays(today, snoozeDays(preset))
}

export interface DueFollowUpNotice {
  leadId: number
  name: string
  dueOn: string
  overdue: boolean
}

/** Leads the Today tab should surface. Overdue first, then oldest date. */
export function selectDueFollowUps(leads: readonly LeadRecord[], today: string): DueFollowUpNotice[] {
  return leads
    .map((lead) => ({ lead, state: followUpState(lead, today) }))
    .filter((row): row is { lead: LeadRecord; state: 'due' | 'overdue' } => row.state === 'due' || row.state === 'overdue')
    .sort((a, b) => {
      if (a.state !== b.state) return a.state === 'overdue' ? -1 : 1
      const date = (a.lead.nextFollowUp ?? '').localeCompare(b.lead.nextFollowUp ?? '')
      if (date !== 0) return date
      return a.lead.name.localeCompare(b.lead.name)
    })
    .map(({ lead, state }) => ({
      leadId: lead.id,
      name: lead.name,
      dueOn: lead.nextFollowUp ?? today,
      overdue: state === 'overdue',
    }))
}

export function daysInCurrentStage(
  lead: { id: number; stage: LeadStage },
  events: readonly { leadId: number; toStage: LeadStage; at: string }[],
  today: string,
): number | null {
  const entered = events
    .filter((event) => event.leadId === lead.id && event.toStage === lead.stage)
    .map((event) => event.at)
    .sort()
  const at = entered[entered.length - 1]
  if (!at || !isIsoDate(today)) return null
  const start = chicagoDate(new Date(at))
  if (!isIsoDate(start)) return null
  return Math.max(0, calendarDaysBetween(start, today))
}

/**
 * Text staff can copy and send themselves.
 * The hub never sends this to a lead or a client.
 */
export function suggestedFollowUpText(lead: {
  name: string
  stage: LeadStage
  source: LeadSource
}): string {
  const first = lead.name.trim().split(/\s+/)[0] || 'there'
  switch (lead.stage) {
    case 'New':
      if (lead.source === 'Referral') {
        return `Hi ${first}, this is Prima Visual. Thanks for the intro — if you want, we can do a short discovery call this week and see if a monthly plan or a one-off shoot fits.`
      }
      if (lead.source === 'Instagram DM') {
        return `Hi ${first}, this is Prima Visual. Thanks for the DM — happy to hop on a short discovery call if you want listing videos.`
      }
      return `Hi ${first}, this is Prima Visual. Thanks for reaching out — we can do a short discovery call this week if you're looking at listing videos.`
    case 'Discovery Booked':
      return `Hi ${first}, this is Prima Visual. Looking forward to the discovery call. If you need a different time, send it over.`
    case 'Discovery Done':
      return `Hi ${first}, this is Prima Visual. Good talking with you. I can send a proposal when you're ready — want me to put that together?`
    case 'Proposal Sent':
      return `Hi ${first}, this is Prima Visual. Checking in on the proposal. Happy to adjust the plan or walk through it.`
    case 'Won':
      return `Hi ${first}, this is Prima Visual. You're booked. We'll send the brief link before the shoot.`
    case 'Lost':
      return `Hi ${first}, this is Prima Visual. Thanks again for considering us. If a listing comes up later, we're here.`
  }
}

export function chicagoDay(now: Date = new Date()): string {
  return chicagoToday(now)
}
