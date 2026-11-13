import PriceField from '../../PriceField'
import { computeKpis } from '@/lib/hub/kpis'
import { requireHubPage } from '@/lib/hub/session'
import { formatDollars, formatPercent } from '@/lib/hub/money'
import { loadClientCards, loadWorkspace } from '@/lib/hub/workspace'
import { chicagoToday } from '@/lib/portal/cycle'
import { sampleStaffEdits } from '@/lib/hub/edits'
import { demoSeedEnabled } from '@/lib/portal/seed'
import { loadStaffEditBoard, notionConfigured } from '@/lib/portal/notion-edits'

export const dynamic = 'force-dynamic'

export default async function KpisPage() {
  await requireHubPage()
  const workspace = await loadWorkspace()
  const cards = await loadClientCards(workspace)
  const configured = notionConfigured()
  const liveBoard = configured ? await loadStaffEditBoard() : null
  const live = liveBoard?.edits ?? null
  const usingSample = !configured && demoSeedEnabled()
  const edits = (live ?? (usingSample ? sampleStaffEdits() : [])).map((edit) => ({
    status: edit.status,
    shotOn: edit.shotOn,
    completedOn: edit.completedOn,
  }))
  const report = computeKpis({
    leads: workspace.leads,
    events: workspace.events,
    today: chicagoToday(workspace.now),
    subscribers: cards
      .filter((client) => client.kind === 'subscription')
      .map((client) => ({
        active: client.active,
        monthlyDollars: client.monthlyDollars,
        remaining: client.remaining,
        renewalSoon: client.renewalSoon,
      })),
    appointments: workspace.appointments,
    countedTypes: workspace.countedTypes,
    edits,
  })
  const width = Math.min(100, report.targetHigh === 0 ? 0 : (report.revenueTowardTarget / report.targetHigh) * 100)
  const tick = (report.targetLow / report.targetHigh) * 100
  return (
    <main>
      <p className="hub-kicker">This month</p>
      <h1>{formatDollars(report.revenueTowardTarget)}</h1>
      <p className="hub-date">
        Target {formatDollars(report.targetLow)}–{formatDollars(report.targetHigh)}. Band: {report.targetBand}.
      </p>
      <div className="hub-meter" aria-hidden="true">
        <span style={{ width: `${width}%` }} />
        <i style={{ left: `${tick}%` }} />
      </div>
      <div className="hub-split" style={{ marginTop: 16 }}>
        <article className="hub-card">
          <p className="hub-kicker">Recurring</p>
          <p className="hub-stat">{formatDollars(report.recurringDollars)}</p>
          <p className="hub-muted">{report.unpricedSubscribers} subscribers have no price</p>
        </article>
        <article className="hub-card">
          <p className="hub-kicker">Won deals</p>
          <p className="hub-stat">{formatDollars(report.wonThisMonthDollars)}</p>
          <p className="hub-muted">{report.wonThisMonthCount} this month</p>
        </article>
      </div>
      <p className="hub-muted" style={{ marginTop: 8 }}>
        Project won {formatDollars(report.projectWonThisMonthDollars)} · subscription deals won{' '}
        {formatDollars(report.subscriptionWonThisMonthDollars)}
      </p>

      <section className="hub-section">
        <h2>Plan prices</h2>
        <p className="hub-muted">Staff-entered stand-in until Stripe. A client price on the Clients tab overrides the plan.</p>
        <div className="hub-stack" style={{ marginTop: 12 }}>
          <PriceField label="1 shoot / month" planSize={1} dollars={workspace.planPrices[1] ?? null} />
          <PriceField label="2 shoots / month" planSize={2} dollars={workspace.planPrices[2] ?? null} />
          <PriceField label="4 shoots / month" planSize={4} dollars={workspace.planPrices[4] ?? null} />
        </div>
      </section>

      <section className="hub-section">
        <h2>Conversion</h2>
        <p className="hub-note">
          Lead to discovery {formatPercent(report.conversion.leadToDiscovery)} · discovery to won{' '}
          {formatPercent(report.conversion.discoveryToWon)} · lead to won {formatPercent(report.conversion.leadToWon)}
        </p>
        <p className="hub-muted">
          {report.conversion.leads} leads · {report.conversion.reachedDiscovery} reached discovery · {report.conversion.won} won
        </p>
        <ul className="hub-stack" style={{ marginTop: 12, padding: 0, listStyle: 'none' }}>
          {report.conversionBySource.map((row) => (
            <li key={row.source} className="hub-card">
              <h2>{row.source}</h2>
              <p className="hub-muted">
                {row.slice.leads} leads · discovery {formatPercent(row.slice.leadToDiscovery)} · won{' '}
                {formatPercent(row.slice.leadToWon)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="hub-section">
        <h2>Deals</h2>
        <p className="hub-note">
          Average won deal {formatDollars(report.averageWonDealDollars)} · {report.wonDealsAtLeast5k} won at $5,000 or more ·{' '}
          {report.openDealsAtLeast5k} open at $5,000 or more
        </p>
      </section>

      <section className="hub-section">
        <h2>Pipeline</h2>
        <ul className="hub-stack" style={{ marginTop: 12, padding: 0, listStyle: 'none' }}>
          {report.pipeline.map((stage) => (
            <li key={stage.stage} className="hub-row">
              <span>
                {stage.stage} · {stage.count}
              </span>
              <span>
                {formatDollars(stage.dollars)}
                {stage.unpriced > 0 ? ` · ${stage.unpriced} unpriced` : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="hub-section hub-split">
        <article className="hub-card">
          <p className="hub-kicker">Overdue</p>
          <p className="hub-stat">{report.overdueFollowUps}</p>
        </article>
        <article className="hub-card">
          <p className="hub-kicker">Unused shoots</p>
          <p className="hub-stat">{report.unusedShoots}</p>
        </article>
        <article className="hub-card">
          <p className="hub-kicker">Renewals soon</p>
          <p className="hub-stat">{report.renewalsSoon}</p>
        </article>
        <article className="hub-card">
          <p className="hub-kicker">Subscribers</p>
          <p className="hub-stat">{report.activeSubscribers}</p>
          <p className="hub-muted">
            {report.inactiveSubscribers} inactive · churn {formatPercent(report.churnRate)}
          </p>
        </article>
      </section>

      <section className="hub-section">
        <h2>Shoots per week</h2>
        <p className="hub-note">
          This week {report.shootsThisWeek}. Prior weeks {report.shootsPriorWeeks.join(', ') || '—'}. Average{' '}
          {report.averageShootsPerWeek == null ? '—' : report.averageShootsPerWeek.toFixed(1)}.
        </p>
      </section>

      <section className="hub-section">
        <h2>Edit turnaround</h2>
        {usingSample && <p className="hub-muted">Sample edits, because Notion is not connected on this environment.</p>}
        {configured && live == null && <p className="hub-muted">Notion could not be read, so these edit numbers are empty.</p>}
        <p className="hub-note">
          Average {report.editTurnaroundDays == null ? '—' : `${report.editTurnaroundDays.toFixed(1)} days`} from{' '}
          {report.editTurnaroundSample} completed {report.editTurnaroundSample === 1 ? 'edit' : 'edits'}. Revision rate{' '}
          {formatPercent(report.revisionRate)} ({report.revisionCount} of {report.revisionBase}).
        </p>
      </section>

      <section className="hub-section">
        <h2>How to read these</h2>
        <ul className="hub-stack" style={{ paddingLeft: 18 }}>
          {report.approximateNotes.map((note) => (
            <li key={note} className="hub-muted">
              {note}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
