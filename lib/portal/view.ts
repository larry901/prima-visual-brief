import { bookingUrl, briefFormHref } from './links'
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
import { clientEmailAddresses } from './clients'
import type { AppointmentRecord, ClientRecord, PlanSize, PortalStore } from './types'

/** Unit under the plan-size number. A 1-shoot plan uses the singular. */
export function shootsPerMonthLabel(planSize: number | null): string {
  return planSize === 1 ? 'shoot / month' : 'shoots / month'
}

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
  showPlan: boolean
  planSize: PlanSize | null
  renewalDate: string
  renewalLabel: string
  cycleStartLabel: string
  used: number
  remaining: number
  nextShoot: PortalAppointmentView | null
  upcoming: PortalAppointmentView[]
  frameioUrl: string | null
  /** Merged scheduler URL for this client only. Null when a subscription client has no private link. */
  bookingUrl: string | null
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
  const showPlan = client.kind === 'subscription'
  let renewalDate = client.renewalDate ?? ''
  let cycleStart = ''
  if (showPlan && client.renewalDate && client.billingAnchorDay) {
    const cycle = resolveCycle(client.renewalDate, today, client.billingAnchorDay)
    if (cycle.renewalDate !== client.renewalDate) {
      await store.updateRenewal(client.id, cycle.renewalDate)
    }
    renewalDate = cycle.renewalDate
    cycleStart = cycle.cycleStart
  }
  const [appointments, countedTypes, briefDates] = await Promise.all([
    store.listAppointmentsForClient(client.id),
    store.getCountedTypes(),
    store.findBriefShootDates(client.name, clientEmailAddresses(client)),
  ])
  const visible = appointments.filter((appointment) => !appointment.needsReview)
  const tally =
    showPlan && client.planSize != null && cycleStart && renewalDate
      ? shootsRemaining({
          planSize: client.planSize,
          cycleStart,
          renewalDate,
          countedTypes,
          appointments: visible,
        })
      : { used: 0, remaining: client.planSize ?? 0 }
  const briefSet = new Set(briefDates)
  const toView = (appointment: AppointmentRecord): PortalAppointmentView => {
    const date = shootDate(appointment.startAt)
    const counts = isCountedType(appointment.appointmentType, countedTypes) && appointment.status !== 'cancelled'
    const needsBrief =
      counts &&
      appointment.status !== 'cancelled' &&
      new Date(appointment.startAt).getTime() > now.getTime() &&
      !briefSet.has(date)
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
    showPlan,
    planSize: client.planSize,
    renewalDate,
    renewalLabel: renewalDate ? formatLongDate(renewalDate) : '',
    cycleStartLabel: cycleStart ? formatLongDate(cycleStart) : '',
    used: tally.used,
    remaining: tally.remaining,
    nextShoot: next ? toView(next) : null,
    upcoming,
    frameioUrl: client.frameioUrl,
    bookingUrl: bookingUrl({
      kind: client.kind,
      schedulingLink: client.schedulingLink,
      name: client.name,
      email: client.email,
    }),
    briefHref: briefFormHref({
      name: client.name,
      email: client.email,
      shootDate: next ? shootDate(next.startAt) : null,
    }),
  }
}
