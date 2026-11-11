'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { FrameLink, PlanSize } from '@/lib/portal/types'

export interface RosterClient {
  id: number
  name: string
  email: string
  company: string
  planSize: PlanSize
  renewalDate: string
  frameioLinks: FrameLink[]
  active: boolean
  remaining: number
  used: number
  renewalLabel: string
  appointments: { id: number; type: string; label: string; status: string }[]
}

export interface ReviewItem {
  id: number
  clientName: string
  clientEmail: string
  appointmentType: string
  label: string
  status: string
  reviewReason: string | null
  rawSubject: string | null
}

interface Draft {
  name: string
  email: string
  company: string
  planSize: PlanSize
  renewalDate: string
  active: boolean
  frameioLinks: FrameLink[]
}

const emptyDraft = (): Draft => ({
  name: '',
  email: '',
  company: '',
  planSize: 2,
  renewalDate: '',
  active: true,
  frameioLinks: [{ label: '', url: '' }],
})

function draftFrom(client: RosterClient): Draft {
  return {
    name: client.name,
    email: client.email,
    company: client.company,
    planSize: client.planSize,
    renewalDate: client.renewalDate,
    active: client.active,
    frameioLinks: client.frameioLinks.length > 0 ? client.frameioLinks : [{ label: '', url: '' }],
  }
}

export default function RosterManager({
  clients,
  reviews,
  countedTypes,
  demoEnabled,
}: {
  clients: RosterClient[]
  reviews: ReviewItem[]
  countedTypes: string[]
  demoEnabled: boolean
}) {
  const router = useRouter()
  const [openId, setOpenId] = useState<number | 'new' | null>(null)
  const [types, setTypes] = useState(countedTypes.join('\n'))
  const [typesMessage, setTypesMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const saveTypes = async () => {
    setBusy(true)
    setTypesMessage(null)
    const response = await fetch('/api/dashboard/clients/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countedTypes: types }),
    })
    const data = await response.json()
    setBusy(false)
    if (!response.ok) {
      setTypesMessage(data.error || 'Could not save')
      return
    }
    setTypesMessage('Saved. Only these appointment types count against a plan.')
    router.refresh()
  }

  const dismiss = async (id: number) => {
    setBusy(true)
    await fetch(`/api/dashboard/reviews/${id}`, { method: 'DELETE' })
    setBusy(false)
    router.refresh()
  }

  return (
    <div className="space-y-10">
      {demoEnabled && (
        <div className="card p-4 text-sm border-[#B0892F]">
          Demo seed is on. The example.com clients are fictional and refresh their sample shoots on each visit.
          Leave <span className="font-medium">PORTAL_DEMO_SEED</span> unset in production.
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold">Roster</h2>
          <button type="button" className="btn-primary" onClick={() => setOpenId(openId === 'new' ? null : 'new')}>
            {openId === 'new' ? 'Close' : 'Add client'}
          </button>
        </div>
        {openId === 'new' && (
          <ClientForm
            draft={emptyDraft()}
            submitLabel="Add client"
            onSubmit={async (draft) => {
              const response = await fetch('/api/dashboard/clients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draft),
              })
              const data = await response.json()
              if (!response.ok) throw new Error(data.error || 'Could not add client')
              setOpenId(null)
              router.refresh()
            }}
          />
        )}
        {clients.length === 0 ? (
          <div className="card p-10 text-center text-brand-muted">No clients yet.</div>
        ) : (
          <ul className="space-y-3">
            {clients.map((client) => (
              <li key={client.id} className="card p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">
                      {client.name}{' '}
                      {!client.active && (
                        <span className="ml-2 text-xs uppercase tracking-wide text-brand-muted">Inactive</span>
                      )}
                    </p>
                    <p className="text-sm text-brand-muted">{client.email}</p>
                    {client.company && <p className="text-sm text-brand-muted">{client.company}</p>}
                  </div>
                  <div className="text-sm sm:text-right">
                    <p>
                      {client.planSize}/month · {client.remaining} left
                    </p>
                    <p className="text-brand-muted">Renews {client.renewalLabel}</p>
                    <button
                      type="button"
                      className="mt-2 text-sm text-brand-dark underline"
                      onClick={() => setOpenId(openId === client.id ? null : client.id)}
                    >
                      {openId === client.id ? 'Close' : 'Edit'}
                    </button>
                  </div>
                </div>
                {client.appointments.length > 0 && (
                  <ul className="mt-4 space-y-1 text-sm text-brand-muted">
                    {client.appointments.map((appointment) => (
                      <li key={appointment.id}>
                        {appointment.status === 'cancelled' ? 'Cancelled' : appointment.status === 'rescheduled' ? 'Rescheduled' : 'Scheduled'}
                        {' · '}
                        {appointment.type}
                        {' · '}
                        {appointment.label}
                      </li>
                    ))}
                  </ul>
                )}
                {openId === client.id && (
                  <div className="mt-4">
                    <ClientForm
                      draft={draftFrom(client)}
                      submitLabel="Save client"
                      onSubmit={async (draft) => {
                        const response = await fetch(`/api/dashboard/clients/${client.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(draft),
                        })
                        const data = await response.json()
                        if (!response.ok) throw new Error(data.error || 'Could not save client')
                        setOpenId(null)
                        router.refresh()
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl font-semibold">Needs review</h2>
        <p className="text-sm text-brand-muted">
          Acuity emails whose address isn&apos;t on the roster, or a reschedule/cancel that matched more than one shoot.
          Nothing here is dropped, and these rows don&apos;t count against a plan.
        </p>
        {reviews.length === 0 ? (
          <div className="card p-8 text-sm text-brand-muted">Nothing waiting.</div>
        ) : (
          <ul className="space-y-3">
            {reviews.map((review) => (
              <li key={review.id} className="card p-5 text-sm space-y-1">
                <p className="font-medium">{review.clientName}</p>
                <p className="text-brand-muted">{review.clientEmail}</p>
                <p>
                  {review.appointmentType} · {review.label} · {review.status}
                </p>
                <p className="text-brand-muted">{reasonLabel(review.reviewReason)}</p>
                {review.rawSubject && <p className="text-brand-muted">Subject: {review.rawSubject}</p>}
                <button type="button" className="btn-secondary mt-2" disabled={busy} onClick={() => dismiss(review.id)}>
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-display text-2xl font-semibold">Shoots that count</h2>
        <p className="text-sm text-brand-muted">
          One Acuity appointment type per line. Discovery calls and anything not listed stay off the monthly count.
        </p>
        <label className="block text-sm font-medium" htmlFor="counted-types">Appointment types</label>
        <textarea
          id="counted-types"
          className="input min-h-[8rem] font-mono"
          value={types}
          onChange={(event) => setTypes(event.target.value)}
        />
        {typesMessage && <p className="text-sm text-brand-muted">{typesMessage}</p>}
        <button type="button" className="btn-primary" disabled={busy} onClick={saveTypes}>
          Save types
        </button>
      </section>
    </div>
  )
}

function reasonLabel(reason: string | null) {
  switch (reason) {
    case 'unmatched_client':
      return 'No client on the roster uses this email.'
    case 'ambiguous_reschedule':
      return 'More than one open appointment could be this reschedule.'
    case 'ambiguous_cancel':
      return 'More than one open appointment could be this cancellation.'
    case 'unknown_appointment':
      return 'Cancellation did not match an open appointment.'
    default:
      return reason || 'Needs a look.'
  }
}

function ClientForm({
  draft,
  submitLabel,
  onSubmit,
}: {
  draft: Draft
  submitLabel: string
  onSubmit: (draft: Draft) => Promise<void>
}) {
  const [form, setForm] = useState<Draft>(draft)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const updateLink = (index: number, patch: Partial<FrameLink>) => {
    setForm({
      ...form,
      frameioLinks: form.frameioLinks.map((link, i) => (i === index ? { ...link, ...patch } : link)),
    })
  }

  return (
    <form
      className="card p-5 space-y-4 bg-brand-bg"
      onSubmit={async (event) => {
        event.preventDefault()
        setSaving(true)
        setError(null)
        try {
          await onSubmit(form)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not save')
        } finally {
          setSaving(false)
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} required />
        <Field label="Email" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
        <Field label="Company" value={form.company} onChange={(company) => setForm({ ...form, company })} />
        <label className="block text-sm">
          <span className="font-medium">Plan</span>
          <select
            className="input mt-1.5"
            value={form.planSize}
            onChange={(event) => setForm({ ...form, planSize: Number(event.target.value) as PlanSize })}
          >
            <option value={2}>2 shoots / month</option>
            <option value={4}>4 shoots / month</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Next renewal</span>
          <input
            className="input mt-1.5"
            type="date"
            required
            value={form.renewalDate}
            onChange={(event) => setForm({ ...form, renewalDate: event.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm mt-6">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) => setForm({ ...form, active: event.target.checked })}
          />
          Active — can sign in
        </label>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Frame.io links</legend>
        {form.frameioLinks.map((link, index) => (
          <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
            <input
              className="input"
              placeholder="Label"
              aria-label={`Video label ${index + 1}`}
              value={link.label}
              onChange={(event) => updateLink(index, { label: event.target.value })}
            />
            <input
              className="input"
              placeholder="https://app.frame.io/..."
              aria-label={`Video URL ${index + 1}`}
              value={link.url}
              onChange={(event) => updateLink(index, { url: event.target.value })}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                setForm({ ...form, frameioLinks: form.frameioLinks.filter((_, i) => i !== index) })
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setForm({ ...form, frameioLinks: [...form.frameioLinks, { label: '', url: '' }] })}
        >
          Add link
        </button>
      </fieldset>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary" type="submit" disabled={saving}>
        {saving ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
}) {
  const id = `field-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <label className="block text-sm" htmlFor={id}>
      <span className="font-medium">{label}</span>
      <input
        id={id}
        className="input mt-1.5"
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
