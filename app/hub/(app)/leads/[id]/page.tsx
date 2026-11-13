import Link from 'next/link'
import { notFound } from 'next/navigation'
import ConvertForm from '../../../ConvertForm'
import LeadActions from '../../../LeadActions'
import LeadFields from '../../../LeadFields'
import { prefillFromLead } from '@/lib/hub/convert'
import { daysInCurrentStage, suggestedFollowUpText } from '@/lib/hub/followups'
import { formatDollars } from '@/lib/hub/money'
import { requireHubPage } from '@/lib/hub/session'
import { loadWorkspace } from '@/lib/hub/workspace'
import { chicagoToday, formatShootInstant } from '@/lib/portal/cycle'

export const dynamic = 'force-dynamic'

export default async function LeadPage({ params }: { params: { id: string } }) {
  await requireHubPage()
  const id = Number(params.id)
  if (!Number.isInteger(id)) notFound()
  const workspace = await loadWorkspace()
  const lead = workspace.leads.find((row) => row.id === id)
  if (!lead) notFound()
  const today = chicagoToday(workspace.now)
  const days = daysInCurrentStage(lead, workspace.events, today)
  const touches = workspace.touches.filter((touch) => touch.leadId === lead.id)
  const history = workspace.events.filter((event) => event.leadId === lead.id)
  const prefill = prefillFromLead(lead, today)
  return (
    <main>
      <p className="hub-kicker">
        <Link className="hub-link" href="/hub/leads">
          Leads
        </Link>
      </p>
      <h1>{lead.name}</h1>
      <p className="hub-date">
        {lead.stage}
        {days != null ? ` · ${days} day${days === 1 ? '' : 's'} in this stage` : ''} · {formatDollars(lead.estimatedValueDollars)}
      </p>
      {lead.discoveryStartAt && (
        <p className="hub-note">
          Discovery {lead.discoveryStatus ?? 'scheduled'} · {formatShootInstant(lead.discoveryStartAt)}
        </p>
      )}
      {lead.lostReason && <p className="hub-warn">Lost: {lead.lostReason}</p>}

      <section className="hub-section">
        <h2>Follow-up</h2>
        <div style={{ marginTop: 12 }}>
          <LeadActions
            leadId={lead.id}
            stage={lead.stage}
            lostReason={lead.lostReason}
            suggestion={suggestedFollowUpText(lead)}
          />
        </div>
      </section>

      {lead.stage === 'Won' && (
        <section className="hub-section">
          <h2>Roster</h2>
          <div style={{ marginTop: 12 }}>
            <ConvertForm
              leadId={lead.id}
              kind={prefill.kind}
              planSize={prefill.planSize ?? 1}
              renewalDate={prefill.renewalDate ?? today}
              convertedClientId={lead.convertedClientId}
            />
          </div>
        </section>
      )}

      <section className="hub-section">
        <h2>Details</h2>
        <div style={{ marginTop: 12 }}>
          <LeadFields lead={lead} />
        </div>
      </section>

      <section className="hub-section">
        <h2>Touches</h2>
        {touches.length === 0 ? (
          <p className="hub-muted">No touches logged.</p>
        ) : (
          <ul className="hub-stack" style={{ marginTop: 12, padding: 0, listStyle: 'none' }}>
            {touches.map((touch) => (
              <li key={touch.id} className="hub-card">
                <p className="hub-kicker">{touch.kind}</p>
                <p className="hub-note">{touch.note || 'No note'}</p>
                <p className="hub-muted">{new Date(touch.at).toLocaleString('en-US', { timeZone: 'America/Chicago' })}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="hub-section">
        <h2>Stage history</h2>
        <ul className="hub-stack" style={{ marginTop: 12, padding: 0, listStyle: 'none' }}>
          {history.map((event) => (
            <li key={event.id} className="hub-muted">
              {event.fromStage ? `${event.fromStage} → ${event.toStage}` : event.toStage} · {event.at.slice(0, 16).replace('T', ' ')} UTC
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
