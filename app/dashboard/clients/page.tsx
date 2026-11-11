import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import DashboardNav from '@/app/dashboard/DashboardNav'
import LogoutButton from '@/app/dashboard/LogoutButton'
import { formatShootInstant } from '@/lib/portal/cycle'
import { demoSeedEnabled, ensureDemoSeed } from '@/lib/portal/seed'
import { getPortalStore } from '@/lib/portal/store'
import { loadPortalView } from '@/lib/portal/view'
import RosterManager, { type ReviewItem, type RosterClient } from './RosterManager'

export const dynamic = 'force-dynamic'

function isAuthenticated() {
  return cookies().get('prima_session')?.value === 'authenticated'
}

export default async function ClientsPage() {
  if (!isAuthenticated()) redirect('/dashboard')

  let clients: RosterClient[] = []
  let reviews: ReviewItem[] = []
  let countedTypes: string[] = []
  let loadError: string | null = null

  try {
    const store = getPortalStore()
    await store.ensureReady()
    await ensureDemoSeed(store)
    const roster = await store.listClients()
    countedTypes = await store.getCountedTypes()
    const reviewRows = await store.listNeedsReview()
    reviews = reviewRows.map((row) => ({
      id: row.id,
      clientName: row.clientName,
      clientEmail: row.clientEmail,
      appointmentType: row.appointmentType,
      label: formatShootInstant(row.startAt),
      status: row.status,
      reviewReason: row.reviewReason,
      rawSubject: row.rawSubject,
    }))
    for (const client of roster) {
      const view = await loadPortalView(store, client)
      const appointments = (await store.listAppointmentsForClient(client.id))
        .filter((appointment) => !appointment.needsReview)
        .map((appointment) => ({
          id: appointment.id,
          type: appointment.appointmentType,
          label: formatShootInstant(appointment.startAt),
          status: appointment.status,
        }))
      clients.push({
        id: client.id,
        name: client.name,
        email: client.email,
        company: client.company,
        kind: client.kind,
        planSize: client.planSize,
        renewalDate: view.renewalDate,
        schedulingLink: client.schedulingLink,
        missingSchedulingLink: client.kind === 'subscription' && !client.schedulingLink,
        frameioLinks: client.frameioLinks,
        active: client.active,
        remaining: view.remaining,
        used: view.used,
        renewalLabel: view.renewalLabel,
        appointments,
      })
    }
  } catch (error) {
    console.error(error)
    loadError = 'The client roster could not be loaded. Check POSTGRES_URL and reload.'
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <header className="bg-white border-b border-brand-border">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="font-display text-xl font-semibold">Prima Visual</div>
          <div className="flex items-center gap-4">
            <DashboardNav current="clients" />
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="max-w-5xl mx-auto px-4 py-8 pb-20">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-semibold">Clients</h1>
          <p className="text-brand-muted text-sm mt-2">
            Subscription clients have a plan, a renewal date, and a private scheduling link. Per-project clients use the shared scheduler.
          </p>
        </div>
        {loadError ? (
          <div className="card p-8 text-red-700">{loadError}</div>
        ) : (
          <RosterManager
            clients={clients}
            reviews={reviews}
            countedTypes={countedTypes}
            demoEnabled={demoSeedEnabled()}
          />
        )}
      </div>
    </div>
  )
}
