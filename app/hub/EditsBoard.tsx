'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { groupStaffEdits, type HubEditBoard, type StaffEdit } from '@/lib/hub/edits'
import { formatLongDate, isIsoDate } from '@/lib/portal/cycle'

function dateLabel(value: string | null): string | null {
  if (!value) return null
  return isIsoDate(value) ? formatLongDate(value) : value
}

function updatedLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export default function EditsBoard({ initial }: { initial: HubEditBoard }) {
  const [board, setBoard] = useState(initial)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pull, setPull] = useState(0)
  const pullRef = useRef(0)
  const pendingRef = useRef(false)

  const refresh = useCallback(async () => {
    if (pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/hub/edits?fresh=1', { cache: 'no-store' })
      const data = (await response.json().catch(() => null)) as HubEditBoard | { error?: string } | null
      if (!response.ok || !data || !('edits' in data) || !Array.isArray(data.edits)) {
        const message = data && 'error' in data && typeof data.error === 'string' ? data.error : 'Could not refresh edits.'
        setError(message)
        return
      }
      setBoard(data)
    } catch {
      setError('Could not refresh edits.')
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }, [])

  useEffect(() => {
    let startY = 0
    let tracking = false
    const onStart = (event: TouchEvent) => {
      if (pendingRef.current || window.scrollY > 8) return
      startY = event.touches[0]?.clientY ?? 0
      tracking = true
    }
    const onMove = (event: TouchEvent) => {
      if (!tracking) return
      if (window.scrollY > 8) {
        tracking = false
        pullRef.current = 0
        setPull(0)
        return
      }
      const delta = (event.touches[0]?.clientY ?? startY) - startY
      const next = delta > 12 ? Math.min(delta, 96) : 0
      pullRef.current = next
      setPull(next)
    }
    const onEnd = () => {
      if (!tracking) return
      tracking = false
      const distance = pullRef.current
      pullRef.current = 0
      setPull(0)
      if (distance >= 70) void refresh()
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [refresh])

  const groups = groupStaffEdits(board.edits)
  const canRefresh = board.configured || board.usingSample
  const stamp = updatedLabel(board.fetchedAt)

  return (
    <>
      <div className="hub-card-top">
        <h1>Edits</h1>
        {canRefresh && (
          <button className="hub-btn hub-btn-ghost" type="button" onClick={() => void refresh()} disabled={pending}>
            {pending ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      </div>
      {pull > 0 && (
        <p className="hub-pull" role="status">
          {pull >= 70 ? 'Release to refresh' : 'Pull to refresh'}
        </p>
      )}
      {stamp && (
        <p className="hub-date" role="status">
          Last updated {stamp} CT
        </p>
      )}
      {error && <p className="hub-error">{error}</p>}
      {board.usingSample && (
        <p className="hub-date">Sample board. Set NOTION_TOKEN to load the Edit database. These rows are not real jobs.</p>
      )}
      {!board.configured && !board.usingSample && (
        <p className="hub-date">Notion is not connected. Set NOTION_TOKEN to load the Edit database.</p>
      )}
      {board.configured && board.unavailable && (
        <p className="hub-date">The Edit database could not be read. The portal keeps working, and this list stays empty until Notion responds.</p>
      )}
      {board.configured && !board.unavailable && board.edits.length === 0 && <p className="hub-date">No edits in the Notion database.</p>}
      <div aria-busy={pending} className={pending ? 'hub-busy' : undefined}>
        {groups.map((group) => (
          <section key={group.status} className="hub-section" aria-labelledby={`status-${group.status}`}>
            <h2 id={`status-${group.status}`}>
              {group.status} · {group.edits.length}
            </h2>
            <ul className="hub-stack" style={{ marginTop: 12, padding: 0, listStyle: 'none' }}>
              {group.edits.map((edit) => (
                <EditCard key={edit.id} edit={edit} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}

function EditCard({ edit }: { edit: StaffEdit }) {
  return (
    <li className="hub-card">
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
  )
}
