import { headers } from 'next/headers'
import ClientRoster from '../../ClientRoster'
import { linkConfidentBriefs } from '@/lib/hub/brief-links'
import { editListState, groupBriefsForRoster, type RosterClientRef } from '@/lib/hub/brief-match'
import { loadHubEditBoard } from '@/lib/hub/edit-board'
import { requireHubPage } from '@/lib/hub/session'
import { loadClientCards, loadWorkspace } from '@/lib/hub/workspace'
import { originFromHeaders } from '@/lib/portal/origin'
import { personalLinkUrl, personalLinksForClients } from '@/lib/portal/personal-link'

export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  await requireHubPage()
  const workspace = await loadWorkspace()
  const origin = originFromHeaders(headers())
  const clientRefs: RosterClientRef[] = workspace.clients.map((client) => ({
    id: client.id,
    email: client.email,
    additionalEmails: client.additionalEmails,
    notionClientId: client.notionClientId,
  }))
  const [cards, tokens, rawBriefs, board] = await Promise.all([
    loadClientCards(workspace),
    personalLinksForClients(
      workspace.portal,
      workspace.clients.map((client) => client.id),
    ).catch(() => {
      console.error('Personal links could not be loaded')
      return new Map<number, string | null>()
    }),
    workspace.portal.listAllBriefs(),
    loadHubEditBoard(),
  ])
  const briefs = await linkConfidentBriefs(workspace.portal, rawBriefs, clientRefs, board.edits, {
    persist: board.configured && !board.unavailable,
  })
  const grouped = groupBriefsForRoster(briefs, clientRefs, board.edits, editListState(board))
  const clients = cards.map((client) => {
    const token = tokens.get(client.id)
    return {
      ...client,
      portalUrl: token ? personalLinkUrl(origin, token) : null,
      briefs: grouped.byClient.get(client.id) ?? [],
    }
  })
  return (
    <main>
      <ClientRoster clients={clients} unmatchedBriefs={grouped.unmatched} />
    </main>
  )
}
