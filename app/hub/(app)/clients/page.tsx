import PriceField from '../../PriceField'
import { formatDollars } from '@/lib/hub/money'
import { requireHubPage } from '@/lib/hub/session'
import { loadClientCards, loadWorkspace } from '@/lib/hub/workspace'

export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  await requireHubPage()
  const workspace = await loadWorkspace()
  const cards = await loadClientCards(workspace)
  const subscribers = cards.filter((client) => client.kind === 'subscription')
  const projects = cards.filter((client) => client.kind === 'project')
  const unused = subscribers.filter((client) => client.active).reduce((sum, client) => sum + client.remaining, 0)
  return (
    <main>
      <p className="hub-kicker">Roster</p>
      <h1>Clients</h1>
      <p className="hub-date">
        {unused} unused subscription shoot{unused === 1 ? '' : 's'} this cycle. Renewals in the next 14 days are marked.
      </p>
      <p className="hub-muted">
        <a className="hub-link" href="/dashboard/clients">
          Open the full roster
        </a>
      </p>

      <section className="hub-section" aria-labelledby="subscribers">
        <h2 id="subscribers">Subscribers</h2>
        {subscribers.length === 0 ? (
          <p className="hub-muted">No subscribers yet.</p>
        ) : (
          <ul className="hub-stack" style={{ marginTop: 12, padding: 0, listStyle: 'none' }}>
            {subscribers.map((client) => (
              <li key={client.id} className={client.renewalSoon ? 'hub-card hub-soon' : 'hub-card'}>
                <div className="hub-card-top">
                  <h2>{client.name}</h2>
                  <p className="hub-muted">{client.active ? 'Active' : 'Inactive'}</p>
                </div>
                <p className="hub-note">{client.company}</p>
                <p className="hub-note">
                  {client.planSize ?? '—'}/month · {client.used} used · {client.remaining} left
                </p>
                <p className={client.renewalSoon ? 'hub-warn' : 'hub-muted'}>
                  {client.renewalLabel ? `Renews ${client.renewalLabel}` : 'No renewal date'}
                  {client.renewalSoon ? ' · within 14 days' : ''}
                </p>
                <p className="hub-muted">
                  Monthly price {formatDollars(client.monthlyDollars)}
                  {client.priceSource === 'client' ? ' · this client' : client.priceSource === 'plan' ? ' · plan default' : ' · not set'}
                </p>
                {client.active && (
                  <PriceField label="Monthly price" clientId={client.id} dollars={client.monthlyDollars} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="hub-section" aria-labelledby="projects">
        <h2 id="projects">Per project</h2>
        {projects.length === 0 ? (
          <p className="hub-muted">No per-project clients yet.</p>
        ) : (
          <ul className="hub-stack" style={{ marginTop: 12, padding: 0, listStyle: 'none' }}>
            {projects.map((client) => (
              <li key={client.id} className="hub-card">
                <div className="hub-card-top">
                  <h2>{client.name}</h2>
                  <p className="hub-muted">{client.active ? 'Active' : 'Inactive'}</p>
                </div>
                <p className="hub-note">{client.company || client.email}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
