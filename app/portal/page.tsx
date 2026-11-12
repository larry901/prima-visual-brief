import { portalBriefCards } from '@/lib/brief-service'
import { loadVideoProgress } from '@/lib/portal/notion-edits'
import { ensureDemoSeed } from '@/lib/portal/seed'
import { readPortalClient } from '@/lib/portal/session'
import { getPortalStore } from '@/lib/portal/store'
import { loadPortalView } from '@/lib/portal/view'
import type { VideoProgressItem } from '@/lib/portal/video-progress'
import PortalHome from './PortalHome'
import PortalLogin from './PortalLogin'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Prima Visual — Client Portal',
  description: 'Your Prima Visual plan, next shoot, and films.',
}

export default async function PortalPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  try {
    const store = getPortalStore()
    await store.ensureReady()
    await ensureDemoSeed(store)
    const client = await readPortalClient(store)
    if (!client) {
      return (
        <PortalLogin
          error={
            searchParams.error === 'link'
              ? 'That sign-in link has expired or already been used. Request a new one.'
              : null
          }
        />
      )
    }
    const [view, briefs, videos] = await Promise.all([
      loadPortalView(store, client),
      portalBriefCards(store, client),
      loadVideoProgress(store, client).catch(() => null as VideoProgressItem[] | null),
    ])
    return <PortalHome view={view} briefs={briefs} videos={videos} />
  } catch (error) {
    console.error('Portal failed to load:', error)
    return (
      <main className="portal-shell">
        <div className="portal-login">
          <p className="portal-kicker">Client portal</p>
          <h1>Portal unavailable</h1>
          <p className="portal-lede">
            We couldn&apos;t reach the client list. If this keeps happening, the database connection needs a look.
          </p>
        </div>
      </main>
    )
  }
}
