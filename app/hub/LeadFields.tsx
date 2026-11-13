'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { LEAD_SOURCES, SERVICE_TYPES, type LeadRecord, type LeadSource, type ServiceType } from '@/lib/hub/types'

export default function LeadFields({ lead }: { lead: LeadRecord }) {
  const router = useRouter()
  const [source, setSource] = useState<LeadSource>(lead.source)
  const [service, setService] = useState<ServiceType | ''>(lead.serviceType ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch(`/api/hub/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          phone: String(form.get('phone') ?? ''),
          email: String(form.get('email') ?? ''),
          company: String(form.get('company') ?? ''),
          referred_by: String(form.get('referred_by') ?? ''),
          notes: String(form.get('notes') ?? ''),
          estimated_value: String(form.get('estimated_value') ?? ''),
          source,
          service_type: service || null,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not save.')
        return
      }
      router.refresh()
    } catch {
      setError('Could not save.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="hub-stack">
      <div className="hub-actions">
        {LEAD_SOURCES.map((item) => (
          <button key={item} type="button" className="hub-chip" aria-pressed={source === item} onClick={() => setSource(item)}>
            {item}
          </button>
        ))}
      </div>
      <label className="hub-label" htmlFor="edit-name">
        Name
        <input id="edit-name" name="name" className="hub-input" defaultValue={lead.name} required />
      </label>
      <label className="hub-label" htmlFor="edit-phone">
        Phone
        <input id="edit-phone" name="phone" className="hub-input" defaultValue={lead.phone} inputMode="tel" />
      </label>
      <label className="hub-label" htmlFor="edit-email">
        Email
        <input id="edit-email" name="email" className="hub-input" defaultValue={lead.email} inputMode="email" />
      </label>
      <label className="hub-label" htmlFor="edit-company">
        Company
        <input id="edit-company" name="company" className="hub-input" defaultValue={lead.company} />
      </label>
      <label className="hub-label" htmlFor="edit-referred">
        Referred by
        <input id="edit-referred" name="referred_by" className="hub-input" defaultValue={lead.referredBy} />
      </label>
      <label className="hub-label" htmlFor="edit-value">
        Estimated value
        <input
          id="edit-value"
          name="estimated_value"
          className="hub-input"
          inputMode="numeric"
          defaultValue={lead.estimatedValueDollars ?? ''}
        />
      </label>
      <div className="hub-actions">
        <button type="button" className="hub-chip" aria-pressed={service === ''} onClick={() => setService('')}>
          Unset
        </button>
        {SERVICE_TYPES.map((item) => (
          <button key={item} type="button" className="hub-chip" aria-pressed={service === item} onClick={() => setService(item)}>
            {item}
          </button>
        ))}
      </div>
      <label className="hub-label" htmlFor="edit-notes">
        Notes
        <textarea id="edit-notes" name="notes" className="hub-textarea" defaultValue={lead.notes} />
      </label>
      {error && <p className="hub-error">{error}</p>}
      <button className="hub-btn" type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save lead'}
      </button>
    </form>
  )
}
