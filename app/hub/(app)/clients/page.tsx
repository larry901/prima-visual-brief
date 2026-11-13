import ClientCard from '../../ClientCard'
import { requireHubPage } from '@/lib/hub/session'
import { loadClientCards, loadWorkspace } from '@/lib/hub/workspace'

export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  await requireHubPage()
  const workspace = await loadWorkspace()
  const cards = await loadClientCards(workspace)
  const active = cards.filter((client) => client.active)
  const inactive = cards.filter((client) => !client.active)
  const subscribers = active.filter((client) => client.kind === 'subscription')
  const projects = active.filter((client) => client.kind === 'project')
  const unused = subscribers.reduce((sum, client) => sum + client.remaining, 0)
  return (
    <main>
      <p className="hub-kicker">Roster</p>
      <h1>Clients</h1>
      <p className="hub-date">
        {unused} unused subscription shoot{unused === 1 ? '' : 's'} this cycle. Renewals in the next 14 days are marked. Inactive clients are not counted.
      </p>
      <p className="hub-muted">
        <a className="hub-link" href="/dashboard/clients">
          Open the full roster
        </a>
      </p>

      <section className="hub-section" aria-labelledby="subscribers">
        <h2 id="subscribers">Subscribers</h2>
        {subscribers.length === 0 ? (
          <p className="hub-muted">No active subscribers.</p>
        ) : (
          <ul className="hub-stack" style={{ marginTop: 12, padding: 0, listStyle: 'none' }}>
            {subscribers.map((client) => (
              <li key={client.id}>
                <ClientCard client={client} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="hub-section" aria-labelledby="projects">
        <h2 id="projects">Per project</h2>
        {projects.length === 0 ? (
          <p className="hub-muted">No active per-project clients.</p>
        ) : (
          <ul className="hub-stack" style={{ marginTop: 12, padding: 0, listStyle: 'none' }}>
            {projects.map((client) => (
              <li key={client.id}>
                <ClientCard client={client} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="hub-section">
        <details className="hub-card">
          <summary>Inactive · {inactive.length}</summary>
          {inactive.length === 0 ? (
            <p className="hub-muted">No inactive clients.</p>
          ) : (
            <ul className="hub-stack" style={{ marginTop: 12, padding: 0, listStyle: 'none' }}>
              {inactive.map((client) => (
                <li key={client.id}>
                  <ClientCard client={client} />
                </li>
              ))}
            </ul>
          )}
        </details>
      </section>
    </main>
  )
}