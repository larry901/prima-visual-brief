'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { LEAD_SOURCES, SERVICE_TYPES, type LeadSource, type ServiceType } from '@/lib/hub/types'

export default function QuickAddForm({ today }: { today: string }) {
  const router = useRouter()
  const [source, setSource] = useState<LeadSource>('Referral')
  const [service, setService] = useState<ServiceType | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const body = {
      name: String(form.get('name') ?? ''),
      phone: String(form.get('phone') ?? ''),
      email: String(form.get('email') ?? ''),
      company: String(form.get('company') ?? ''),
      referred_by: String(form.get('referred_by') ?? ''),
      notes: String(form.get('notes') ?? ''),
      next_follow_up: String(form.get('next_follow_up') ?? '') || null,
      estimated_value: String(form.get('estimated_value') ?? ''),
      source,
      service_type: service || null,
      stage: 'New',
    }
    try {
      const response = await fetch('/api/hub/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not save the lead.')
        return
      }
      router.push(`/hub/leads/${data.lead.id}`)
      router.refresh()
    } catch {
      setError('Could not save the lead.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="hub-stack">
      <div className="hub-actions" aria-label="Source">
        {LEAD_SOURCES.map((item) => (
          <button
            key={item}
            type="button"
            className="hub-chip"
            aria-pressed={item === source}
            onClick={() => setSource(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <label className="hub-label" htmlFor="lead-name">
        Name
        <input id="lead-name" name="name" className="hub-input" required autoComplete="name" />
      </label>
      <label className="hub-label" htmlFor="lead-phone">
        Phone
        <input id="lead-phone" name="phone" className="hub-input" inputMode="tel" autoComplete="tel" />
      </label>
      <label className="hub-label" htmlFor="lead-email">
        Email
        <input id="lead-email" name="email" className="hub-input" inputMode="email" autoComplete="email" />
      </label>
      <label className="hub-label" htmlFor="lead-company">
        Company
        <input id="lead-company" name="company" className="hub-input" autoComplete="organization" />
      </label>
      {source === 'Referral' && (
        <label className="hub-label" htmlFor="lead-referred">
          Referred by
          <input id="lead-referred" name="referred_by" className="hub-input" />
        </label>
      )}
      {source !== 'Referral' && <input type="hidden" name="referred_by" value="" />}
      <label className="hub-label" htmlFor="lead-follow">
        Next follow-up
        <input id="lead-follow" name="next_follow_up" className="hub-input" type="date" defaultValue={today} />
      </label>
      <label className="hub-label" htmlFor="lead-value">
        Estimated value
        <input id="lead-value" name="estimated_value" className="hub-input" inputMode="numeric" placeholder="5000" />
      </label>
      <div className="hub-actions" aria-label="Service">
        <button type="button" className="hub-chip" aria-pressed={service === ''} onClick={() => setService('')}>
          Unset
        </button>
        {SERVICE_TYPES.map((item) => (
          <button key={item} type="button" className="hub-chip" aria-pressed={service === item} onClick={() => setService(item)}>
            {item}
          </button>
        ))}
      </div>
      <label className="hub-label" htmlFor="lead-notes">
        Notes
        <textarea id="lead-notes" name="notes" className="hub-textarea" />
      </label>
      {error && <p className="hub-error">{error}</p>}
      <button className="hub-btn hub-btn-block" type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Add lead'}
      </button>
    </form>
  )
}
