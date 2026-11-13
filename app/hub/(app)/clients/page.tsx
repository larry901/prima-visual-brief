import ClientRoster from '../../ClientRoster'
import { requireHubPage } from '@/lib/hub/session'
import { loadClientCards, loadWorkspace } from '@/lib/hub/workspace'

export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  await requireHubPage()
  const workspace = await loadWorkspace()
  const cards = await loadClientCards(workspace)
  return (
    <main>
      <ClientRoster clients={cards} />
    </main>
  )
}
