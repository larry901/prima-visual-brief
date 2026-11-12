import { isPersonalToken, personalLinkStatus } from '@/lib/portal/personal-link'
import { getPortalStore } from '@/lib/portal/store'
import PersonalLinkSignIn from './PersonalLinkSignIn'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Prima Visual — Client Portal',
  description: 'Sign in to your Prima Visual portal.',
  robots: { index: false, follow: false },
}

export default async function PersonalLinkPage({ params }: { params: { token: string } }) {
  const token = typeof params.token === 'string' ? params.token : ''
  if (!isPersonalToken(token)) return <PersonalLinkUnavailable />
  try {
    const store = getPortalStore()
    await store.ensureReady()
    const status = await personalLinkStatus(store, token)
    if (status !== 'ready') return <PersonalLinkUnavailable />
    return <PersonalLinkSignIn token={token} />
  } catch (error) {
    console.error('Personal link failed to load:', error)
    return <PersonalLinkUnavailable />
  }
}

function PersonalLinkUnavailable() {
  return (
    <main className="portal-shell">
      <header className="portal-top">
        <p className="portal-wordmark">Prima Visual</p>
      </header>
      <div className="portal-login">
        <p className="portal-kicker">Client portal</p>
        <h1>Link unavailable</h1>
        <p className="portal-lede">This link isn&apos;t available. Ask Prima Visual for a new one.</p>
        <a className="portal-text-link" href="/portal">Request a one-time email link</a>
      </div>
    </main>
  )
}
