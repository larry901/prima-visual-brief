import Link from 'next/link'
import { isLeadStage, isOpenStage, LEAD_STAGES } from '@/lib/hub/types'
import { requireHubPage } from '@/lib/hub/session'
import { loadWorkspace } from '@/lib/hub/workspace'
import { formatDollars } from '@/lib/hub/money'

export const dynamic = 'force-dynamic'

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: { stage?: string }
}) {
  await requireHubPage()
  const workspace = await loadWorkspace()
  const selected = searchParams.stage === 'all' || isLeadStage(searchParams.stage) ? searchParams.stage : 'open'
  const leads = workspace.leads.filter((lead) => {
    if (selected === 'open' || !selected) return isOpenStage(lead.stage)
    if (selected === 'all') return true
    return lead.stage === selected
  })
  const filters = ['open', ...LEAD_STAGES, 'all'] as const
  return (
    <main>
      <div className="hub-card-top">
        <div>
          <p className="hub-kicker">Pipeline</p>
          <h1>Leads</h1>
        </div>
        <Link className="hub-btn" href="/hub/leads/new">
          Add
        </Link>
      </div>
      <div className="hub-filters" style={{ marginTop: 16 }} aria-label="Filter by stage">
        {filters.map((filter) => (
          <Link
            key={filter}
            className="hub-chip"
            href={filter === 'open' ? '/hub/leads' : `/hub/leads?stage=${encodeURIComponent(filter)}`}
            aria-current={selected === filter || (filter === 'open' && selected === 'open') ? 'page' : undefined}
          >
            {filter === 'open' ? 'Open' : filter === 'all' ? 'All' : filter}
          </Link>
        ))}
      </div>
      {leads.length === 0 ? (
        <p className="hub-muted" style={{ marginTop: 16 }}>
          No leads in this view.
        </p>
      ) : (
        <ul className="hub-stack" style={{ marginTop: 16, padding: 0, listStyle: 'none' }}>
          {leads.map((lead) => (
            <li key={lead.id}>
              <Link href={`/hub/leads/${lead.id}`} className="hub-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="hub-card-top">
                  <h2>{lead.name}</h2>
                  <p className="hub-muted">{formatDollars(lead.estimatedValueDollars)}</p>
                </div>
                <p className="hub-muted">
                  {lead.stage} · {lead.source}
                  {lead.company ? ` · ${lead.company}` : ''}
                </p>
                <p className="hub-note">{lead.nextFollowUp ? `Follow up ${lead.nextFollowUp}` : 'No follow-up date'}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
