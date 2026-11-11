import { acuitySchedulerUrl, briefFormHref } from './links'
import {
  chicagoDate,
  chicagoToday,
  formatLongDate,
  formatShootInstant,
  isCountedType,
  nextShoot,
  resolveCycle,
  shootsRemaining,
} from './cycle'
import type { AppointmentRecord, ClientRecord, FrameLink, PortalStore } from './types'

export interface PortalAppointmentView {
  id: number
  type: string
  startAt: string
  label: string
  countsTowardPlan: boolean
  needsBrief: boolean
  briefHref: string
  status: string
}

export interface PortalView {
  name: string
  email: string
  company: string
  planSize: 2 | 4
  renewalDate: string
  renewalLabel: string
  cycleStartLabel: string
  used: number
  remaining: number
  nextShoot: PortalAppointmentView | null
  upcoming: PortalAppointmentView[]
  videos: FrameLink[]
  acuityUrl: string
  briefHref: string
}

function shootDate(startAt: string): string {
  return chicagoDate(new Date(startAt))
}

export async function loadPortalView(
  store: PortalStore,
  client: ClientRecord,
  now: Date = new Date(),
): Promise<PortalView> {
  const today = chicagoToday(now)
  const cycle = resolveCycle(client.renewalDate, today, client.billingAnchorDay)
  if (cycle.renewalDate !== client.renewalDate) {
    await store.updateRenewal(client.id, cycle.renewalDate)
  }
  const [appointments, countedTypes, briefDates] = await Promise.all([
    store.listAppointmentsForClient(client.id),
    store.getCountedTypes(),
    store.findBriefShootDates(client.name, client.email),
  ])
  const visible = appointments.filter((appointment) => !appointment.needsReview)
  const tally = shootsRemaining({
    planSize: client.planSize,
    cycleStart: cycle.cycleStart,
    renewalDate: cycle.renewalDate,
    countedTypes,
    appointments: visible,
  })
  const briefSet = new Set(briefDates)
  const toView = (appointment: AppointmentRecord): PortalAppointmentView => {
    const date = shootDate(appointment.startAt)
    const counts = isCountedType(appointment.appointmentType, countedTypes) && appointment.status !== 'cancelled'
    const needsBrief = counts && appointment.status !== 'cancelled' && new Date(appointment.startAt).getTime() > now.getTime() && !briefSet.has(date)
    return {
      id: appointment.id,
      type: appointment.appointmentType,
      startAt: appointment.startAt,
      label: formatShootInstant(appointment.startAt),
      countsTowardPlan: counts,
      needsBrief,
      briefHref: briefFormHref({ name: client.name, email: client.email, shootDate: date }),
      status: appointment.status,
    }
  }
  const upcoming = visible
    .filter((appointment) => appointment.status !== 'cancelled' && new Date(appointment.startAt).getTime() > now.getTime())
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    .map(toView)
  const next = nextShoot(visible, countedTypes, now)
  return {
    name: client.name,
    email: client.email,
    company: client.company,
    planSize: client.planSize,
    renewalDate: cycle.renewalDate,
    renewalLabel: formatLongDate(cycle.renewalDate),
    cycleStartLabel: formatLongDate(cycle.cycleStart),
    used: tally.used,
    remaining: tally.remaining,
    nextShoot: next ? toView(next) : null,
    upcoming,
    videos: client.frameioLinks,
    acuityUrl: acuitySchedulerUrl(client.name, client.email),
    briefHref: briefFormHref({
      name: client.name,
      email: client.email,
      shootDate: next ? shootDate(next.startAt) : null,
    }),
  }
}
