import { groupStaffEdits, sampleStaffEdits } from '@/lib/hub/edits'
import { requireHubPage } from '@/lib/hub/session'
import { demoSeedEnabled } from '@/lib/portal/seed'
import { loadStaffEditBoard, notionConfigured } from '@/lib/portal/notion-edits'
import { formatLongDate, isIsoDate } from '@/lib/portal/cycle'

export const dynamic = 'force-dynamic'

function dateLabel(value: string | null): string | null {
  if (!value) return null
  return isIsoDate(value) ? formatLongDate(value) : value
}

export default async function EditsPage() {
  await requireHubPage()
  const configured = notionConfigured()
  const live = configured ? await loadStaffEditBoard() : null
  const usingSample = !configured && demoSeedEnabled()
  const edits = live ?? (usingSample ? sampleStaffEdits() : [])
  const groups = groupStaffEdits(edits)
  return (
    <main>
      <p className="hub-kicker">Notion</p>
      <h1>Edits</h1>
      {usingSample && (
        <p className="hub-date">Sample board. Set NOTION_TOKEN to load the Edit database. These rows are not real jobs.</p>
      )}
      {!configured && !usingSample && (
        <p className="hub-date">Notion is not connected. Set NOTION_TOKEN to load the Edit database.</p>
      )}
      {configured && live == null && (
        <p className="hub-date">The Edit database could not be read. The portal keeps working, and this list stays empty until Notion responds.</p>
      )}
      {configured && live && live.length === 0 && <p className="hub-date">No edits in the Notion database.</p>}
      {groups.map((group) => (
        <section key={group.status} className="hub-section" aria-labelledby={`status-${group.status}`}>
          <h2 id={`status-${group.status}`}>
            {group.status} · {group.edits.length}
          </h2>
          <ul className="hub-stack" style={{ marginTop: 12, padding: 0, listStyle: 'none' }}>
            {group.edits.map((edit) => (
              <li key={edit.id} className="hub-card">
                <div className="hub-card-top">
                  <h2>{edit.name}</h2>
                  <a className="hub-link" href={edit.notionUrl} target="_blank" rel="noopener noreferrer">
                    Notion
                  </a>
                </div>
                <p className="hub-note">{edit.clientName}</p>
                <p className="hub-muted">
                  {edit.shotOn ? `Shot ${dateLabel(edit.shotOn)}` : 'No shoot date'}
                  {edit.dueLabel ? ` · Due ${dateLabel(edit.dueLabel)}` : ''}
                  {edit.turnaroundDays != null ? ` · ${edit.turnaroundDays} days to completed` : ''}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
