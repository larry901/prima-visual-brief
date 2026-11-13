import { isDiscoveryAppointmentType } from '../portal/appointment-types'
import {
  addDays,
  chicagoDate,
  chicagoToday,
  formatShootInstant,
  isCountedType,
  isIsoDate,
} from '../portal/cycle'
import type { AppointmentRecord } from '../portal/types'
import { selectDueFollowUps, type DueFollowUpNotice } from './followups'
import { weekStartMonday } from './kpis'
import type { LeadRecord } from './types'

export interface TodayDiscovery {
  key: string
  leadId: number | null
  name: string
  email: string
  startAt: string
  label: string
  status: string
}

export interface TodayShoot {
  id: number
  name: string
  type: string
  startAt: string
  label: string
  day: string
}

export interface TodayModel {
  today: string
  weekStart: string
  weekEnd: string
  followUps: DueFollowUpNotice[]
  discoveries: TodayDiscovery[]
  shootsToday: TodayShoot[]
  shootsLaterThisWeek: TodayShoot[]
}

const DISCOVERY_HORIZON_DAYS = 14

export const TODAY_SECTION_ORDER = ['shoots', 'discoveries', 'followUps'] as const
export type TodaySectionId = (typeof TODAY_SECTION_ORDER)[number]

/** Populated sections stay in shoots, calls, then follow-ups. Empty sections drop to the bottom. */
export function orderTodaySections<T extends { id: TodaySectionId; populated: boolean }>(sections: readonly T[]): T[] {
  const rank = new Map(TODAY_SECTION_ORDER.map((id, index) => [id, index]))
  return [...sections].sort((a, b) => {
    if (a.populated !== b.populated) return a.populated ? -1 : 1
    return (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)
  })
}

function slotKey(email: string, startAt: string): string {
  return `slot:${email.trim().toLowerCase()}|${new Date(startAt).getTime()}`
}

function upcomingStart(startAt: string, now: Date, horizon: Date): boolean {
  const time = new Date(startAt).getTime()
  return !Number.isNaN(time) && time >= now.getTime() && time <= horizon.getTime()
}

/**
 * Today: due and overdue follow-ups, discovery calls in the next 14 days,
 * and shoots today or later this week (Monday–Sunday, America/Chicago).
 * Discovery appointments are not shoots.
 */
export function buildTodayModel(input: {
  leads: readonly LeadRecord[]
  appointments: readonly AppointmentRecord[]
  countedTypes: readonly string[]
  now?: Date
}): TodayModel {
  const now = input.now ?? new Date()
  const today = chicagoToday(now)
  const weekStart = weekStartMonday(today)
  const weekEnd = addDays(weekStart, 6)
  const horizon = new Date(now.getTime() + DISCOVERY_HORIZON_DAYS * 86_400_000)
  const discoveries: TodayDiscovery[] = []

  const pushDiscovery = (row: TodayDiscovery) => {
    if (discoveries.some((existing) => existing.key === row.key)) return
    discoveries.push(row)
  }

  for (const appointment of input.appointments) {
    if (!isDiscoveryAppointmentType(appointment.appointmentType)) continue
    if (appointment.status === 'cancelled' || appointment.needsReview) continue
    if (!upcomingStart(appointment.startAt, now, horizon)) continue
    const acuityKey = appointment.acuityAppointmentId ? `acuity:${appointment.acuityAppointmentId}` : null
    pushDiscovery({
      key: acuityKey ?? slotKey(appointment.clientEmail, appointment.startAt),
      leadId: null,
      name: appointment.clientName || appointment.clientEmail,
      email: appointment.clientEmail,
      startAt: appointment.startAt,
      label: formatShootInstant(appointment.startAt),
      status: appointment.status,
    })
  }

  for (const lead of input.leads) {
    if (lead.stage === 'Lost' || lead.discoveryStatus === 'cancelled' || !lead.discoveryStartAt) continue
    if (!upcomingStart(lead.discoveryStartAt, now, horizon)) continue
    const acuityKey = lead.acuityAppointmentId ? `acuity:${lead.acuityAppointmentId}` : null
    const slot = slotKey(lead.email || lead.name, lead.discoveryStartAt)
    const startMs = new Date(lead.discoveryStartAt).getTime()
    const existing = discoveries.find(
      (row) =>
        row.key === acuityKey ||
        row.key === slot ||
        (lead.email !== '' && row.email === lead.email && new Date(row.startAt).getTime() === startMs),
    )
    if (existing) {
      existing.leadId = lead.id
      if (lead.name.trim()) existing.name = lead.name
      continue
    }
    pushDiscovery({
      key: acuityKey ?? slot,
      leadId: lead.id,
      name: lead.name,
      email: lead.email,
      startAt: lead.discoveryStartAt,
      label: formatShootInstant(lead.discoveryStartAt),
      status: lead.discoveryStatus ?? 'scheduled',
    })
  }

  discoveries.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime() || a.name.localeCompare(b.name))

  const shoots: TodayShoot[] = []
  for (const appointment of input.appointments) {
    if (appointment.needsReview || appointment.status === 'cancelled') continue
    if (isDiscoveryAppointmentType(appointment.appointmentType)) continue
    if (!isCountedType(appointment.appointmentType, [...input.countedTypes])) continue
    const parsed = new Date(appointment.startAt)
    if (Number.isNaN(parsed.getTime())) continue
    const day = chicagoDate(parsed)
    if (!isIsoDate(day) || day < today || day > weekEnd) continue
    shoots.push({
      id: appointment.id,
      name: appointment.clientName || appointment.clientEmail,
      type: appointment.appointmentType,
      startAt: appointment.startAt,
      label: formatShootInstant(appointment.startAt),
      day,
    })
  }
  shoots.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime() || a.name.localeCompare(b.name))

  return {
    today,
    weekStart,
    weekEnd,
    followUps: selectDueFollowUps(input.leads, today),
    discoveries,
    shootsToday: shoots.filter((shoot) => shoot.day === today),
    shootsLaterThisWeek: shoots.filter((shoot) => shoot.day !== today),
  }
}
