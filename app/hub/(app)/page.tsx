import Link from 'next/link'
import LeadActions from '../LeadActions'
import { notifyDueFollowUps } from '@/lib/hub/push'
import { suggestedFollowUpText } from '@/lib/hub/followups'
import { buildTodayModel } from '@/lib/hub/today'
import { requireHubPage } from '@/lib/hub/session'
import { loadWorkspace } from '@/lib/hub/workspace'
import { formatLongDate } from '@/lib/portal/cycle'

export const dynamic = 'force-dynamic'

export default async function TodayPage() {
  await requireHubPage()
  try {
    const workspace = await loadWorkspace()
    const model = buildTodayModel({
      leads: workspace.leads,
      appointments: workspace.appointments,
      countedTypes: workspace.countedTypes,
      now: workspace.now,
    })
    const leadsById = new Map(workspace.leads.map((lead) => [lead.id, lead]))
    try {
      await notifyDueFollowUps(model.followUps)
    } catch (error) {
      console.error('Follow-up hook failed', error instanceof Error ? error.message : 'error')
    }
    return (
      <main>
        <p className="hub-kicker">Today</p>
        <h1>{formatLongDate(model.today)}</h1>
        <p className="hub-date">Follow-ups, discovery calls, and shoots. Nothing here sends a message.</p>

        <section className="hub-section" aria-labelledby="follow-ups">
          <h2 id="follow-ups">Follow-ups</h2>
          {model.followUps.length === 0 ? (
            <p className="hub-muted">Nothing due today.</p>
          ) : (
            <div className="hub-stack" style={{ marginTop: 12 }}>
              {model.followUps.map((item) => {
                const lead = leadsById.get(item.leadId)
                if (!lead) return null
                return (
                  <article key={lead.id} className="hub-card">
                    <div className="hub-card-top">
                      <h2>
                        <Link className="hub-link" href={`/hub/leads/${lead.id}`}>
                          {lead.name}
                        </Link>
                      </h2>
                      <p className={item.overdue ? 'hub-warn' : 'hub-muted'}>{item.overdue ? 'Overdue' : 'Due today'}</p>
                    </div>
                    <p className="hub-muted">
                      {lead.stage} · {lead.source}
                      {lead.company ? ` · ${lead.company}` : ''}
                    </p>
                    <LeadActions
                      leadId={lead.id}
                      stage={lead.stage}
                      lostReason={lead.lostReason}
                      suggestion={suggestedFollowUpText(lead)}
                    />
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="hub-section" aria-labelledby="discoveries">
          <h2 id="discoveries">Discovery calls</h2>
          {model.discoveries.length === 0 ? (
            <p className="hub-muted">No discovery calls in the next 14 days.</p>
          ) : (
            <ul className="hub-stack" style={{ marginTop: 12, padding: 0, listStyle: 'none' }}>
              {model.discoveries.map((call) => (
                <li key={call.key} className="hub-card">
                  <div className="hub-card-top">
                    <h2>
                      {call.leadId ? (
                        <Link className="hub-link" href={`/hub/leads/${call.leadId}`}>
                          {call.name}
                        </Link>
                      ) : (
                        call.name
                      )}
                    </h2>
                    <p className="hub-muted">{call.status}</p>
                  </div>
                  <p className="hub-note">{call.label}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="hub-section" aria-labelledby="shoots">
          <h2 id="shoots">Shoots</h2>
          {model.shootsToday.length === 0 && model.shootsLaterThisWeek.length === 0 ? (
            <p className="hub-muted">No shoots left this week.</p>
          ) : (
            <ul className="hub-stack" style={{ marginTop: 12, padding: 0, listStyle: 'none' }}>
              {model.shootsToday.map((shoot) => (
                <li key={shoot.id} className="hub-card">
                  <p className="hub-kicker">Today</p>
                  <h2>{shoot.name}</h2>
                  <p className="hub-note">
                    {shoot.type} · {shoot.label}
                  </p>
                </li>
              ))}
              {model.shootsLaterThisWeek.map((shoot) => (
                <li key={shoot.id} className="hub-card">
                  <p className="hub-kicker">This week</p>
                  <h2>{shoot.name}</h2>
                  <p className="hub-note">
                    {shoot.type} · {shoot.label}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    )
  } catch (error) {
    console.error('Today failed', error instanceof Error ? error.message : 'error')
    return (
      <main>
        <h1>Today is unavailable</h1>
        <p className="hub-note">The hub could not be loaded. Check the database connection and reload.</p>
      </main>
    )
  }
}
