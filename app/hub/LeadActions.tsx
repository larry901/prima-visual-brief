'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import LogWonDeal from './LogWonDeal'
import type { LeadStage, ServiceType, TouchKind } from '@/lib/hub/types'
import { LEAD_STAGES } from '@/lib/hub/types'

const TOUCHES: { kind: TouchKind; label: string }[] = [
  { kind: 'call', label: 'Call' },
  { kind: 'text', label: 'Text' },
  { kind: 'dm', label: 'DM' },
  { kind: 'email', label: 'Email' },
]

export default function LeadActions({
  leadId,
  stage,
  lostReason,
  suggestion,
  estimatedValueDollars,
  serviceType,
  today,
}: {
  leadId: number
  stage: LeadStage
  lostReason: string
  suggestion: string
  estimatedValueDollars?: number | null
  serviceType?: ServiceType | null
  today: string
}) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [reason, setReason] = useState(lostReason)
  const [date, setDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, setPending] = useState(false)
  const [winning, setWinning] = useState(false)

  async function send(url: string, body: unknown) {
    setPending(true)
    setError(null)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not save that.')
        return
      }
      setNote('')
      router.refresh()
    } catch {
      setError('Could not save that.')
    } finally {
      setPending(false)
    }
  }

  async function patch(body: unknown) {
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/hub/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not save that.')
        return
      }
      router.refresh()
    } catch {
      setError('Could not save that.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="hub-stack">
      <div className="hub-actions" aria-label="Log a touch">
        {TOUCHES.map((touch) => (
          <button
            key={touch.kind}
            type="button"
            className="hub-chip"
            disabled={pending}
            onClick={() => send(`/api/hub/leads/${leadId}/touch`, { kind: touch.kind, note })}
          >
            {touch.label}
          </button>
        ))}
      </div>
      <label className="hub-label" htmlFor={`note-${leadId}`}>
        Note for the touch
        <input
          id={`note-${leadId}`}
          className="hub-input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional"
        />
      </label>
      <div className="hub-actions" aria-label="Snooze">
        <button type="button" className="hub-chip" disabled={pending} onClick={() => patch({ snooze: 'tomorrow' })}>
          Tomorrow
        </button>
        <button type="button" className="hub-chip" disabled={pending} onClick={() => patch({ snooze: '3days' })}>
          3 days
        </button>
        <button type="button" className="hub-chip" disabled={pending} onClick={() => patch({ snooze: 'week' })}>
          Next week
        </button>
      </div>
      <form
        className="hub-row"
        onSubmit={(event) => {
          event.preventDefault()
          if (date) void patch({ next_follow_up: date })
        }}
      >
        <label className="hub-label" htmlFor={`date-${leadId}`} style={{ flex: 1 }}>
          Next date
          <input
            id={`date-${leadId}`}
            className="hub-input"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <button className="hub-btn" type="submit" disabled={pending || !date}>
          Set
        </button>
      </form>
      <div className="hub-actions" aria-label="Stage">
        {LEAD_STAGES.filter((item) => item !== 'Lost' && item !== 'Won').map((item) => (
          <button
            key={item}
            type="button"
            className="hub-chip"
            aria-pressed={item === stage}
            disabled={pending || item === stage}
            onClick={() => {
              void patch({ stage: item })
            }}
          >
            {item}
          </button>
        ))}
        <button
          type="button"
          className="hub-chip"
          aria-pressed={stage === 'Won' || winning}
          disabled={pending}
          onClick={() => setWinning((open) => !open)}
        >
          Log won deal
        </button>
      </div>
      {winning && (
        <LogWonDeal
          leadId={leadId}
          initialAmount={estimatedValueDollars}
          initialType={serviceType}
          today={today}
          onDone={() => setWinning(false)}
        />
      )}
      <form
        className="hub-stack"
        onSubmit={(event) => {
          event.preventDefault()
          void patch({ stage: 'Lost', lost_reason: reason })
        }}
      >
        <label className="hub-label" htmlFor={`lost-${leadId}`}>
          Lost reason
          <input
            id={`lost-${leadId}`}
            className="hub-input"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <button className="hub-btn hub-btn-ghost" type="submit" disabled={pending || !reason.trim()}>
          Mark lost
        </button>
      </form>
      <div className="hub-stack">
        <button
          type="button"
          className="hub-btn hub-btn-ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(suggestion)
              setCopied(true)
            } catch {
              setCopied(false)
              setError('Select the text below and copy it. Nothing was sent.')
            }
          }}
        >
          {copied ? 'Copied' : 'Copy text'}
        </button>
        <textarea className="hub-textarea" readOnly value={suggestion} aria-label="Suggested follow-up text" />
        <p className="hub-muted">Copy this and send it yourself. The hub does not message anyone.</p>
      </div>
      {error && <p className="hub-error">{error}</p>}
    </div>
  )
}
