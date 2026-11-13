'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import type { ServiceType } from '@/lib/hub/types'

export default function LogWonDeal({
  leadId,
  initialAmount,
  initialType,
  today,
  onDone,
}: {
  /** Set when the deal is a lead. Omit to log a deal that never was a lead. */
  leadId?: number
  initialAmount?: number | null
  initialType?: ServiceType | null
  today: string
  onDone?: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState(initialAmount == null ? '' : String(initialAmount))
  const [kind, setKind] = useState<ServiceType>(initialType ?? 'project')
  const [wonOn, setWonOn] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const standalone = leadId == null

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const response = await fetch(standalone ? '/api/hub/won-deals' : `/api/hub/leads/${leadId}`, {
        method: standalone ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          standalone
            ? { name, amountDollars: amount, serviceType: kind, wonOn }
            : { stage: 'Won', estimated_value: amount, service_type: kind },
        ),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not log the deal.')
        return
      }
      onDone?.()
      router.refresh()
    } catch {
      setError('Could not log the deal.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="hub-stack" onSubmit={submit}>
      <p className="hub-muted">
        {kind === 'subscription'
          ? 'Subscription value is the new monthly amount. It counts as new MRR, not as a one-off.'
          : 'One-off value counts in this month’s project revenue.'}
      </p>
      {standalone && (
        <label className="hub-label" htmlFor="won-deal-name">
          Name
          <input
            id="won-deal-name"
            className="hub-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="off"
          />
        </label>
      )}
      <label className="hub-label" htmlFor={standalone ? 'won-deal-amount' : `won-deal-amount-${leadId}`}>
        {kind === 'subscription' ? 'Monthly amount' : 'Deal amount'}
        <input
          id={standalone ? 'won-deal-amount' : `won-deal-amount-${leadId}`}
          className="hub-input"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
          placeholder="0"
        />
      </label>
      <div className="hub-actions" role="group" aria-label="Deal type">
        <button
          type="button"
          className="hub-chip"
          aria-pressed={kind === 'project'}
          onClick={() => setKind('project')}
        >
          One-off project
        </button>
        <button
          type="button"
          className="hub-chip"
          aria-pressed={kind === 'subscription'}
          onClick={() => setKind('subscription')}
        >
          Subscription (monthly)
        </button>
      </div>
      {standalone && (
        <label className="hub-label" htmlFor="won-deal-date">
          Won on
          <input
            id="won-deal-date"
            className="hub-input"
            type="date"
            value={wonOn}
            onChange={(event) => setWonOn(event.target.value)}
            required
          />
        </label>
      )}
      {error && <p className="hub-error">{error}</p>}
      <button className="hub-btn hub-btn-block" type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Log won deal'}
      </button>
    </form>
  )
}
