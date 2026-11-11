import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { editWindow, prefillFromBrief, shootStartsForClient } from '@/lib/brief-service'
import { clientOwnsBrief } from '@/lib/brief-logic'
import { ensureDemoSeed } from '@/lib/portal/seed'
import { readPortalClient } from '@/lib/portal/session'
import { getPortalStore } from '@/lib/portal/store'
import { changedBriefFields } from '@/lib/brief-logic'
import type { BriefRow } from '@/lib/db'

export const dynamic = 'force-dynamic'

function changedLabels(brief: BriefRow): string[] {
  if (!brief.previous_snapshot) return []
  try {
    const previous = JSON.parse(brief.previous_snapshot) as Record<string, unknown>
    return changedBriefFields(previous, brief as unknown as Record<string, unknown>)
  } catch {
    return []
  }
}

export default async function PortalBriefPage({ params }: { params: { id: string } }) {
  const store = getPortalStore()
  await store.ensureReady()
  await ensureDemoSeed(store)
  const client = await readPortalClient(store)
  if (!client) redirect('/portal')
  const id = Number(params.id)
  const brief = Number.isInteger(id) ? await store.getBriefById(id) : null
  if (!brief || !clientOwnsBrief(brief, client)) notFound()
  const starts = await shootStartsForClient(store, brief.client_id ?? client.id)
  const { editable } = editWindow(brief, starts, new Date())
  const details = prefillFromBrief(brief)
  const changed = changedLabels(brief)

  return (
    <div className="portal">
      <main className="portal-shell">
        <div className="portal-layout">
          <p className="portal-kicker">Your brief</p>
          <h1 className="portal-film-label" style={{ fontSize: '2rem' }}>{details.propertyAddress}</h1>
          <p>Shoot {details.shootDate}</p>
          <p className="portal-muted">Submitted for {details.agentName}</p>
          {brief.edited_by_client && <p className="portal-muted">Edited by you</p>}
          {changed.length > 0 && <p className="portal-muted">Last edit changed: {changed.join(', ')}</p>}
          <section className="portal-block">
            <h2>Shoot</h2>
            <p>{details.agentOnSite}</p>
            {details.gateCode && <p>Gate {details.gateCode}</p>}
            {details.lockboxCode && <p>Lockbox {details.lockboxCode}</p>}
            {details.accessNotes && <p>{details.accessNotes}</p>}
          </section>
          <section className="portal-block">
            <h2>Videos</h2>
            <ul className="portal-brief-list">
              {details.videoTypes.map((type) => (
                <li key={type} className="portal-brief-card">
                  <p className="portal-film-label">{type}</p>
                  {details.videoDetails[type]?.highlights && <p>{details.videoDetails[type].highlights}</p>}
                  {details.videoDetails[type]?.script && <p>{details.videoDetails[type].script}</p>}
                </li>
              ))}
            </ul>
          </section>
          {details.driveLink && (
            <p><a className="portal-text-link" href={details.driveLink}>Files</a></p>
          )}
          {details.assetNotes && <p>{details.assetNotes}</p>}
          <div className="portal-actions">
            {editable ? (
              <a className="portal-btn" href={`/portal/briefs/${brief.id}/edit`}>Edit brief</a>
            ) : (
              <div className="portal-empty">
                <p>This brief is locked.</p>
                <p>Contact us for changes — email clients@primavisual.io.</p>
              </div>
            )}
            <Link href="/portal" className="portal-text-link">Back to your portal</Link>
          </div>
        </div>
      </main>
    </div>
  )
}
