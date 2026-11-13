'use client'

import { useRef, useState } from 'react'
import { groupStaffEdits, type StaffEdit } from '@/lib/hub/edits'
import { formatLongDate, isIsoDate } from '@/lib/portal/cycle'

function dateLabel(value: string | null): string | null {
  if (!value) return null
  return isIsoDate(value) ? formatLongDate(value) : value
}

function updatedLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'just now'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

export default function EditsBoard({
  initialEdits,
  initialUpdatedAt,
  mode,
}: {
  initialEdits: StaffEdit[]
  initialUpdatedAt: string
  mode: 'notion' | 'sample' | 'empty' | 'error'
}) {
  const [edits, setEdits] = useState(initialEdits)
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(mode === 'error' ? 'The Edit database could not be read.' : null)
  const [source, setSource] = useState(mode)
  const [pull, setPull] = useState(0)
  const startY = useRef<number | null>(null)

  async function refresh() {
    if (loading) return
    setLoading(true)
    setError(null)
    const started = Date.now()
    try {
      const response = await fetch('/api/hub/edits', { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not refresh.')
        return
      }
      setEdits(Array.isArray(data.edits) ? data.edits : [])
      if (typeof data.updatedAt === 'string') setUpdatedAt(data.updatedAt)
      if (data.source === 'sample' || data.source === 'notion' || data.source === 'unconfigured') {
        setSource(data.source === 'unconfigured' ? 'empty' : data.source)
      }
    } catch {
      setError('Could not refresh.')
    } finally {
      const remaining = 350 - (Date.now() - started)
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
      setLoading(false)
      setPull(0)
    }
  }

  const groups = groupStaffEdits(edits)

  return (
    <div
      onTouchStart={(event) => {
        if (window.scrollY > 0) return
        startY.current = event.touches[0]?.clientY ?? null
      }}
      onTouchMove={(event) => {
        if (startY.current == null || window.scrollY > 0) return
        const next = (event.touches[0]?.clientY ?? startY.current) - startY.current
        setPull(Math.max(0, Math.min(80, next)))
      }}
      onTouchEnd={() => {
        if (pull > 56) void refresh()
        else setPull(0)
        startY.current = null
      }}
    >
      <div className="hub-card-top">
        <div>
          <p className="hub-kicker">Notion</p>
          <h1>Edits</h1>
        </div>
        <button id="hub-refresh" type="button" className="hub-btn" onClick={() => void refresh()} disabled={loading} aria-busy={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <p className="hub-date">Last updated {updatedLabel(updatedAt)}</p>
      {pull > 12 && <p className="hub-muted">{pull > 56 ? 'Release to refresh' : 'Pull to refresh'}</p>}
      {source === 'sample' && (
        <p className="hub-date">Sample board. Set NOTION_TOKEN to load the Edit database. These rows are not real jobs.</p>
      )}
      {source === 'empty' && <p className="hub-date">Notion is not connected. Set NOTION_TOKEN to load the Edit database.</p>}
      {error && <p className="hub-error">{error}</p>}
      <div aria-busy={loading} className={loading ? 'hub-loading' : undefined}>
        {source === 'notion' && edits.length === 0 && !loading && <p className="hub-date">No edits in the Notion database.</p>}
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
      </div>
    </div>
  )
}
