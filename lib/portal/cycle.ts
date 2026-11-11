/** Billing-cycle math for the client portal. Pure functions, no database. */

export const CHICAGO = 'America/Chicago'

export const DEFAULT_COUNTED_TYPES = [
  'Listing Shoot',
  'Property Shoot',
  'Video Shoot',
  'Real Estate Shoot',
  'Photo & Video Shoot',
  'One-Time Shoot',
]

export interface CycleWindow {
  /** First day of the current cycle, inclusive (YYYY-MM-DD). */
  cycleStart: string
  /** Next renewal, exclusive end of the current cycle (YYYY-MM-DD). */
  renewalDate: string
  /** Day of month the plan bills on (1–31), kept so February does not permanently shorten a 31st. */
  anchorDay: number
}

export interface ShootAppointment {
  appointmentType: string
  startAt: string
  status: string
  needsReview?: boolean
}

export function chicagoDate(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  if (!year || !month || !day) throw new Error('Could not format Chicago date')
  return `${year}-${month}-${day}`
}

export function chicagoToday(now: Date = new Date()): string {
  return chicagoDate(now)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (month < 1 || month > 12 || day < 1) return false
  return day <= daysInMonth(year, month)
}

/**
 * Move a calendar month while pinning the day to `anchorDay`.
 * Months that are shorter than the anchor (31 → February) clamp to the last day,
 * and a later month restores the anchor (February 28 → March 31).
 */
export function addMonths(isoDate: string, months: number, anchorDay: number): string {
  if (!isIsoDate(isoDate)) throw new Error(`Invalid date: ${isoDate}`)
  if (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) {
    throw new Error(`Invalid anchor day: ${anchorDay}`)
  }
  const year = Number(isoDate.slice(0, 4))
  const month = Number(isoDate.slice(5, 7))
  const shifted = new Date(Date.UTC(year, month - 1 + months, 1))
  const nextYear = shifted.getUTCFullYear()
  const nextMonth = shifted.getUTCMonth() + 1
  const day = Math.min(anchorDay, daysInMonth(nextYear, nextMonth))
  return formatIso(nextYear, nextMonth, day)
}

export function formatIso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * The stored renewal date is the next day a full plan count begins.
 * Once that date is today or earlier in Chicago, roll it forward one month
 * at a time until it is in the future.
 */
export function resolveCycle(storedRenewal: string, today: string, anchorDay?: number): CycleWindow {
  if (!isIsoDate(storedRenewal)) throw new Error(`Invalid renewal date: ${storedRenewal}`)
  if (!isIsoDate(today)) throw new Error(`Invalid today: ${today}`)
  const anchor = anchorDay ?? Number(storedRenewal.slice(8, 10))
  let renewalDate = storedRenewal
  let guard = 0
  while (renewalDate <= today) {
    renewalDate = addMonths(renewalDate, 1, anchor)
    guard += 1
    if (guard > 600) throw new Error('Renewal date could not be rolled forward')
  }
  return {
    cycleStart: addMonths(renewalDate, -1, anchor),
    renewalDate,
    anchorDay: anchor,
  }
}

export function isCountedType(type: string, countedTypes: string[]): boolean {
  const norm = type.trim().toLowerCase()
  if (!norm) return false
  return countedTypes.some((entry) => entry.trim().toLowerCase() === norm)
}

export function shootsRemaining(args: {
  planSize: number
  cycleStart: string
  renewalDate: string
  countedTypes: string[]
  appointments: ShootAppointment[]
}): { used: number; remaining: number } {
  const used = args.appointments.filter((appointment) => {
    if (appointment.needsReview) return false
    if (appointment.status === 'cancelled') return false
    if (!isCountedType(appointment.appointmentType, args.countedTypes)) return false
    const day = chicagoDate(new Date(appointment.startAt))
    return day >= args.cycleStart && day < args.renewalDate
  }).length
  return { used, remaining: Math.max(0, args.planSize - used) }
}

export function nextShoot<T extends ShootAppointment>(
  appointments: T[],
  countedTypes: string[],
  now: Date = new Date(),
): T | null {
  const nowMs = now.getTime()
  const upcoming = appointments
    .filter((appointment) => {
      if (appointment.needsReview) return false
      if (appointment.status === 'cancelled') return false
      if (!isCountedType(appointment.appointmentType, countedTypes)) return false
      return new Date(appointment.startAt).getTime() > nowMs
    })
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
  return upcoming[0] ?? null
}

/** Wall-clock time in America/Chicago converted to a UTC instant. */
export function chicagoWallTimeToUtc(isoDate: string, hour: number, minute: number): Date {
  if (!isIsoDate(isoDate)) throw new Error(`Invalid date: ${isoDate}`)
  const year = Number(isoDate.slice(0, 4))
  const month = Number(isoDate.slice(5, 7))
  const day = Number(isoDate.slice(8, 10))
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0)
  for (let i = 0; i < 4; i += 1) {
    const parts = formatter.formatToParts(new Date(guess))
    const gotYear = Number(parts.find((p) => p.type === 'year')?.value)
    const gotMonth = Number(parts.find((p) => p.type === 'month')?.value)
    const gotDay = Number(parts.find((p) => p.type === 'day')?.value)
    const gotHour = Number(parts.find((p) => p.type === 'hour')?.value)
    const gotMinute = Number(parts.find((p) => p.type === 'minute')?.value)
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0)
    const got = Date.UTC(gotYear, gotMonth - 1, gotDay, gotHour, gotMinute, 0)
    if (wanted === got) break
    guess += wanted - got
  }
  return new Date(guess)
}

export function formatLongDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function formatShootInstant(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso))
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + days))
  return formatIso(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())
}
