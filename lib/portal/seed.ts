import { addDays, chicagoToday, chicagoWallTimeToUtc } from './cycle'
import type { PortalStore } from './types'

const DEMO_EMAILS = ['maya.chen@example.com', 'andre.walsh@example.com', 'priya.nair@example.com']

export function demoSeedEnabled(): boolean {
  return process.env.PORTAL_DEMO_SEED === 'true'
}

/** Fictional roster used for local preview and screenshots. Never includes real client emails. */
export async function seedDemoRoster(store: PortalStore, now: Date = new Date()): Promise<void> {
  await store.ensureReady()
  const today = chicagoToday(now)
  const mayaRenewal = addDays(today, 18)
  const priyaRenewal = addDays(today, 40)
  const upcoming = chicagoWallTimeToUtc(addDays(today, 3), 10, 0).toISOString()
  const past = chicagoWallTimeToUtc(addDays(today, -6), 9, 30).toISOString()
  const call = chicagoWallTimeToUtc(addDays(today, 1), 15, 0).toISOString()
  const unmatchedStart = chicagoWallTimeToUtc(addDays(today, 5), 11, 0).toISOString()

  const maya = await upsertClient(store, {
    name: 'Maya Chen',
    email: 'maya.chen@example.com',
    company: 'Harbor & Co Realty',
    kind: 'subscription',
    planSize: 4,
    renewalDate: mayaRenewal,
    schedulingLink: 'https://example.com/schedule/maya?certificate=EXAMPLE-CODE',
    active: true,
    frameioLinks: [
      { label: 'Listing film — 1426 Cortlandt', url: 'https://app.frame.io/reviews/demo-listing-maya' },
      { label: 'Brand reel', url: 'https://app.frame.io/reviews/demo-brand-maya' },
    ],
  })
  const andre = await upsertClient(store, {
    name: 'Andre Walsh',
    email: 'andre.walsh@example.com',
    company: 'Walsh Group',
    kind: 'project',
    planSize: null,
    renewalDate: null,
    schedulingLink: null,
    active: true,
    frameioLinks: [{ label: 'Just sold — Heights', url: 'https://app.frame.io/reviews/demo-just-sold-andre' }],
  })
  await upsertClient(store, {
    name: 'Priya Nair',
    email: 'priya.nair@example.com',
    company: 'Nair Homes',
    kind: 'subscription',
    planSize: 2,
    renewalDate: priyaRenewal,
    schedulingLink: null,
    active: false,
    frameioLinks: [],
  })

  await replaceSeedAppointments(store, maya.id, [
    {
      acuityAppointmentId: 'demo-maya-past',
      appointmentType: 'Listing Shoot',
      startAt: past,
      status: 'scheduled' as const,
      clientEmail: maya.email,
      clientName: maya.name,
    },
    {
      acuityAppointmentId: 'demo-maya-upcoming',
      appointmentType: 'Listing Shoot',
      startAt: upcoming,
      status: 'scheduled' as const,
      clientEmail: maya.email,
      clientName: maya.name,
    },
    {
      acuityAppointmentId: 'demo-maya-call',
      appointmentType: 'Discovery Call',
      startAt: call,
      status: 'scheduled' as const,
      clientEmail: maya.email,
      clientName: maya.name,
    },
  ])
  await replaceSeedAppointments(store, andre.id, [
    {
      acuityAppointmentId: 'demo-andre-upcoming',
      appointmentType: 'One-Time Shoot',
      startAt: chicagoWallTimeToUtc(addDays(today, 4), 13, 0).toISOString(),
      status: 'scheduled' as const,
      clientEmail: andre.email,
      clientName: andre.name,
    },
  ])

  const existingReview = await store.findAppointmentByAcuityId('demo-unmatched-1')
  if (existingReview) await store.dismissReview(existingReview.id)
  await store.insertAppointment({
    clientId: null,
    acuityAppointmentId: 'demo-unmatched-1',
    appointmentType: 'Listing Shoot',
    startAt: unmatchedStart,
    status: 'scheduled',
    source: 'seed',
    clientEmail: 'jordan.guest@example.com',
    clientName: 'Jordan Guest',
    rawSubject: 'New Appointment: Listing Shoot with Jordan Guest',
    needsReview: true,
    reviewReason: 'unmatched_client',
  })
}

export async function ensureDemoSeed(store: PortalStore): Promise<void> {
  if (!demoSeedEnabled()) return
  await seedDemoRoster(store)
}

async function upsertClient(
  store: PortalStore,
  input: {
    name: string
    email: string
    company: string
    kind: 'subscription' | 'project'
    planSize: 2 | 4 | null
    renewalDate: string | null
    schedulingLink: string | null
    active: boolean
    frameioLinks: { label: string; url: string }[]
  },
) {
  const existing = await store.findClientByEmail(input.email)
  if (!existing) return store.createClient(input)
  return store.updateClient(existing.id, input)
}

async function replaceSeedAppointments(
  store: PortalStore,
  clientId: number,
  rows: {
    acuityAppointmentId: string
    appointmentType: string
    startAt: string
    status: 'scheduled' | 'rescheduled' | 'cancelled'
    clientEmail: string
    clientName: string
  }[],
) {
  const current = await store.listAppointmentsForClient(clientId)
  for (const appointment of current) {
    if (appointment.source !== 'seed') continue
    if (!appointment.needsReview) {
      await store.updateAppointment(appointment.id, { needsReview: true, reviewReason: 'seed_refresh' })
    }
    await store.dismissReview(appointment.id)
  }
  for (const row of rows) {
    const stale = await store.findAppointmentByAcuityId(row.acuityAppointmentId)
    if (stale) {
      if (!stale.needsReview) {
        await store.updateAppointment(stale.id, { needsReview: true, reviewReason: 'seed_refresh' })
      }
      await store.dismissReview(stale.id)
    }
    await store.insertAppointment({
      clientId,
      acuityAppointmentId: row.acuityAppointmentId,
      appointmentType: row.appointmentType,
      startAt: row.startAt,
      status: row.status,
      source: 'seed',
      clientEmail: row.clientEmail,
      clientName: row.clientName,
      rawSubject: null,
      needsReview: false,
      reviewReason: null,
    })
  }
}

export const DEMO_CLIENT_EMAILS = DEMO_EMAILS
