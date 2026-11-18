'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { EditListState } from '@/lib/hub/brief-match'

export interface BriefEditChoice {
  id: string
  name: string
  status: string
  shotOn: string | null
  clientIds: string[]
}

function samePage(left: string, right: string): boolean {
  return left.replace(/-/g, '').toLowerCase() === right.replace(/-/g, '').toLowerCase()
}

function shotLabel(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'No shoot date'
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

async function readError(response: Response): Promise<string> {
  const data = await response.json().catch(() => null)
  return data && typeof data.error === 'string' ? data.error : 'Could not save the Edit link.'
}

export default function BriefEditLink({
  briefId,
  pageId,
  linkSource,
  status,
  notionUrl,
  notion,
  sample,
  clientNotionId,
  edits,
}: {
  briefId: number
  pageId: string | null
  linkSource: 'auto' | 'manual' | null
  status: string
  notionUrl: string | null
  notion: EditListState
  sample: boolean
  clientNotionId: string | null
  edits: BriefEditChoice[]
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [pasted, setPasted] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needle = query.trim().toLowerCase()
  const forClient = clientNotionId
    ? edits.filter((edit) => edit.clientIds.some((id) => samePage(id, clientNotionId)))
    : []
  const pool =
    needle.length >= 2
      ? edits.filter((edit) => `${edit.name} ${edit.status} ${edit.shotOn ?? ''}`.toLowerCase().includes(needle))
      : forClient
  const available = pool.filter((edit) => (pageId ? !samePage(edit.id, pageId) : true))
  const choices = available.slice(0, 8)
  const hidden = available.length - choices.length
  const current = pageId ? edits.find((edit) => samePage(edit.id, pageId)) : undefined

  const save = async (nextPageId: string | null) => {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/hub/briefs/${briefId}/notion`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: nextPageId }),
      })
      if (!response.ok) {
        setError(await readError(response))
        return
      }
      setQuery('')
      setPasted('')
      router.refresh()
    } catch {
      setError('Could not save the Edit link.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="hub-card" aria-labelledby={`edit-link-${briefId}`}>
      <p id={`edit-link-${briefId}`} className="hub-kicker">
        Edit project
      </p>
      <p className="hub-note">{status}</p>
      {current ? <p className="hub-muted">{current.name}</p> : null}
      {pageId && notionUrl ? (
        <a className="hub-btn hub-btn-block" href={notionUrl} target="_blank" rel="noopener noreferrer">
          Open in Notion
        </a>
      ) : null}
      <p className="hub-muted">
        {pageId && linkSource === 'manual'
          ? 'Chosen by staff. Automatic matching will leave this choice in place.'
          : pageId
            ? "Matched from the client's Notion page, the shoot date, and the property."
            : 'No confident Edit match yet. Pick a page, or paste its Notion link.'}
      </p>
      {sample ? (
        <p className="hub-muted">This list is sample data, so picking one is turned off. Paste a real Notion link to save it.</p>
      ) : null}
      {notion === 'unavailable' ? <p className="hub-muted">Notion could not be read. A saved link is unchanged.</p> : null}
      {notion === 'off' && !sample ? (
        <p className="hub-muted">Notion is not connected. Paste an Edit page link to save one.</p>
      ) : null}

      {notion !== 'off' || sample ? (
        <label className="hub-label" htmlFor={`edit-search-${briefId}`}>
          Find an Edit page
          <input
            id={`edit-search-${briefId}`}
            className="hub-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Property or title"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      ) : null}
      {needle.length < 2 && !clientNotionId && notion !== 'off' ? (
        <p className="hub-muted">This client has no Notion page. Search by property to choose an edit.</p>
      ) : null}
      {needle.length < 2 && clientNotionId && forClient.length === 0 && notion === 'ready' ? (
        <p className="hub-muted">No Edit pages for this Notion client. Search all edits, or paste a link.</p>
      ) : null}
      {choices.length > 0 ? (
        <ul className="hub-brief-list">
          {choices.map((edit) => (
            <li key={edit.id}>
              <button
                className="hub-btn hub-btn-ghost hub-btn-block hub-choice"
                type="button"
                disabled={saving || sample}
                onClick={() => {
                  if (sample) return
                  void save(edit.id)
                }}
              >
                <span>{edit.name}</span>
                <span className="hub-muted">
                  {shotLabel(edit.shotOn)} · {edit.status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {hidden > 0 ? <p className="hub-muted">Keep typing to narrow the list.</p> : null}

      <form
        className="hub-stack"
        onSubmit={(event) => {
          event.preventDefault()
          const value = pasted.trim()
          if (!value) return
          void save(value)
        }}
      >
        <label className="hub-label" htmlFor={`edit-paste-${briefId}`}>
          Or paste a Notion link
          <input
            id={`edit-paste-${briefId}`}
            className="hub-input"
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            placeholder="https://www.notion.so/…"
            autoComplete="off"
            spellCheck={false}
            inputMode="url"
          />
        </label>
        <button className="hub-btn hub-btn-block" type="submit" disabled={saving || pasted.trim() === ''}>
          {saving ? 'Saving…' : 'Save link'}
        </button>
      </form>
      {pageId ? (
        <button
          className="hub-btn hub-btn-ghost hub-btn-block"
          type="button"
          disabled={saving}
          onClick={() => {
            void save(null)
          }}
        >
          {saving ? 'Saving…' : 'Remove link'}
        </button>
      ) : null}
      {error ? <p className="hub-error">{error}</p> : null}
    </section>
  )
}
