import { headers } from 'next/headers'
import ClientRoster from '../../ClientRoster'
import { requireHubPage } from '@/lib/hub/session'
import { loadClientCards, loadWorkspace } from '@/lib/hub/workspace'
import { originFromHeaders } from '@/lib/portal/origin'
import { personalLinkUrl, personalLinksForClients } from '@/lib/portal/personal-link'

export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  await requireHubPage()
  const workspace = await loadWorkspace()
  const origin = originFromHeaders(headers())
  const [cards, tokens] = await Promise.all([
    loadClientCards(workspace),
    personalLinksForClients(
      workspace.portal,
      workspace.clients.map((client) => client.id),
    ).catch(() => {
      console.error('Personal links could not be loaded')
      return new Map<number, string | null>()
    }),
  ])
  const clients = cards.map((client) => {
    const token = tokens.get(client.id)
    return { ...client, portalUrl: token ? personalLinkUrl(origin, token) : null }
  })
  return (
    <main>
      <ClientRoster clients={clients} />
    </main>
  )
}
