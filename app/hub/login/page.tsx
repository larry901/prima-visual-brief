import { redirect } from 'next/navigation'
import { readHubStaff } from '@/lib/hub/session'
import HubLoginForm from '../HubLoginForm'

export const dynamic = 'force-dynamic'

export default async function HubLoginPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  if (await readHubStaff()) redirect('/hub/')
  return (
    <HubLoginForm
      error={searchParams.error === 'link' ? 'That sign-in link has expired or already been used. Request a new one.' : null}
    />
  )
}
