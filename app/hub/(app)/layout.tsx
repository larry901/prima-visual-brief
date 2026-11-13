import { redirect } from 'next/navigation'
import { readHubStaff } from '@/lib/hub/session'
import HubTabs from '../HubTabs'
import SignOutButton from '../SignOutButton'

export const dynamic = 'force-dynamic'

export default async function HubAppLayout({ children }: { children: React.ReactNode }) {
  const staff = await readHubStaff()
  if (!staff) redirect('/hub/login')
  return (
    <div className="hub-app">
      <header className="hub-top">
        <div>
          <p className="hub-wordmark">Prima Hub</p>
          <p className="hub-signed-in">{staff.email ?? 'Staff'}</p>
        </div>
        <SignOutButton />
      </header>
      <div className="hub-main">{children}</div>
      <HubTabs />
    </div>
  )
}
