'use client'

import { useEffect, useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  ROSTER_VIEW_OPTIONS,
  countClientsByRosterView,
  filterClientsByRosterView,
  kindForRosterView,
  rosterEmptyMessage,
  rosterPlanSummary,
  rosterViewHref,
  type RosterView,
} from '@/lib/portal/roster-view'
import type { ClientKind, PlanSize } from '@/lib/portal/types'

export interface RosterClient {
  id: number
  name: string
  email: string
  additionalEmails: string[]
  company: string
  kind: ClientKind
  planSize: PlanSize | null
  renewalDate: string
  schedulingLink: string | null
  missingSchedulingLink: boolean
  frameioUrl: string | null
  active: boolean
  remaining: number
  used: number
  renewalLabel: string
  appointments: { id: number; type: string; label: string; status: string }[]
  portalUrl: string | null
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
  additionalEmails: string[]
  company: string
  kind: ClientKind
  planSize: PlanSize
  renewalDate: string
  schedulingLink: string
  active: boolean
  frameioUrl: string
}

const emptyDraft = (): Draft => ({
  name: '',
  email: '',
  additionalEmails: [],
  company: '',
  kind: 'subscription',
  planSize: 2,
  renewalDate: '',
  schedulingLink: '',
  active: true,
  frameioUrl: '',
})

function draftFrom(client: RosterClient): Draft {
  return {
    name: client.name,
    email: client.email,
    additionalEmails: client.additionalEmails ?? [],
    company: client.company,
    kind: client.kind,
    planSize: client.planSize ?? 2,
    renewalDate: client.renewalDate,
    schedulingLink: client.schedulingLink ?? '',
    active: client.active,
    frameioUrl: client.frameioUrl ?? '',
  }
}

export default function RosterManager({
  clients,
  reviews,
  countedTypes,
  demoEnabled,
  rosterView,
}: {
  clients: RosterClient[]
  reviews: ReviewItem[]
  countedTypes: string[]
  demoEnabled: boolean
  rosterView: RosterView
}) {
  const router = useRouter()
  const [openId, setOpenId] = useState<number | 'new' | null>(null)
  const [types, setTypes] = useState(countedTypes.join('\n'))
  const [typesMessage, setTypesMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingView, setPendingView] = useState<RosterView | null>(null)
  if (pendingView !== null && pendingView === rosterView) {
    setPendingView(null)
  }
  const view = pendingView ?? rosterView
  const counts = countClientsByRosterView(clients)
  const visibleClients = filterClientsByRosterView(clients, view)

  const selectView = (next: RosterView) => {
    if (next === view) return
    if (typeof openId === 'number') {
      const kind = kindForRosterView(next)
      const staysOpen = clients.some((client) => client.id === openId && client.kind === kind)
      if (!staysOpen) setOpenId(null)
    }
    setPendingView(next)
    router.replace(rosterViewHref(next), { scroll: false })
  }

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
        <div className="card p-4 text-sm border-[#435A57]">
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
        <RosterViewSwitch view={view} counts={counts} onChange={selectView} />
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
        <div id="roster-panel" role="tabpanel" aria-labelledby={`roster-tab-${view}`}>
          {visibleClients.length === 0 ? (
            <div className="card p-10 text-center text-brand-muted">{rosterEmptyMessage(view, clients.length)}</div>
          ) : (
            <ul className="space-y-3">
              {visibleClients.map((client) => {
                const plan = rosterPlanSummary(client, view)
                return (
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
                        {client.additionalEmails.length > 0 && (
                          <p className="text-sm text-brand-muted">{client.additionalEmails.join(', ')}</p>
                        )}
                        {client.company && <p className="text-sm text-brand-muted">{client.company}</p>}
                      </div>
                      <div className="text-sm sm:text-right">
                        {plan && (
                          <>
                            <p>{plan.planLine}</p>
                            <p className="text-brand-muted">{plan.renewalLine}</p>
                            {plan.missingSchedulingLink && (
                              <p className="text-red-700">Missing scheduling link</p>
                            )}
                          </>
                        )}
                        <button
                          type="button"
                          className={`${plan ? 'mt-2 ' : ''}text-sm text-brand-dark underline`}
                          onClick={() => setOpenId(openId === client.id ? null : client.id)}
                        >
                          {openId === client.id ? 'Close' : 'Edit'}
                        </button>
                      </div>
                    </div>
                    <PersonalLinkControls clientId={client.id} url={client.portalUrl} active={client.active} />
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
                )
              })}
            </ul>
          )}
        </div>
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

function RosterViewSwitch({
  view,
  counts,
  onChange,
}: {
  view: RosterView
  counts: Record<RosterView, number>
  onChange: (view: RosterView) => void
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = ROSTER_VIEW_OPTIONS.length - 1
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = index === last ? 0 : index + 1
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = index === 0 ? last : index - 1
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = last
    if (nextIndex == null || nextIndex === index) return
    event.preventDefault()
    const next = ROSTER_VIEW_OPTIONS[nextIndex].view
    onChange(next)
    requestAnimationFrame(() => {
      document.getElementById(`roster-tab-${next}`)?.focus()
    })
  }

  return (
    <div
      role="tablist"
      aria-label="Roster"
      className="grid grid-cols-2 gap-1 rounded-lg border border-brand-border bg-white p-1"
    >
      {ROSTER_VIEW_OPTIONS.map((option, index) => {
        const selected = view === option.view
        const count = counts[option.view]
        return (
          <button
            key={option.view}
            type="button"
            role="tab"
            id={`roster-tab-${option.view}`}
            aria-selected={selected}
            aria-controls="roster-panel"
            tabIndex={selected ? 0 : -1}
            className={`flex min-h-11 w-full min-w-0 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-md px-1.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-dark/40 sm:flex-row sm:gap-2 sm:px-3 ${
              selected ? 'bg-brand-dark text-white' : 'text-brand-dark hover:bg-brand-bg'
            }`}
            onClick={() => onChange(option.view)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className="max-w-full text-center text-[13px] leading-tight sm:text-sm">{option.label}</span>
            <span
              className={`inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums ${
                selected ? 'bg-white text-brand-dark' : 'bg-brand-bg text-brand-dark'
              }`}
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function PersonalLinkControls({
  clientId,
  url: initialUrl,
  active,
}: {
  clientId: number
  url: string | null
  active: boolean
}) {
  const router = useRouter()
  const [url, setUrl] = useState(initialUrl)
  const [seenUrl, setSeenUrl] = useState(initialUrl)
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  if (initialUrl !== seenUrl) {
    setSeenUrl(initialUrl)
    setUrl(initialUrl)
  }

  useEffect(() => {
    if (!copied) return
    const id = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(id)
  }, [copied])

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setNotice(null)
    } catch {
      setCopied(false)
      setNotice('Select the link and copy it.')
    }
  }

  const reset = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const response = await fetch(`/api/dashboard/clients/${clientId}/link`, { method: 'POST' })
      const data = await response.json().catch(() => null)
      const nextUrl = data && typeof data.url === 'string' ? data.url : null
      if (!response.ok || !nextUrl) {
        const message = data && typeof data.error === 'string' ? data.error : 'Could not reset the link.'
        setNotice(message)
        return
      }
      setUrl(nextUrl)
      setCopied(false)
      setConfirming(false)
      setNotice('New link ready. The old one no longer works.')
      router.refresh()
    } catch {
      setNotice('Could not reset the link.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 border-t border-brand-border pt-4">
      <p className="text-sm font-medium" id={`personal-link-label-${clientId}`}>Personal link</p>
      <p className="mt-1 text-xs text-brand-muted">
        Send this when a video is ready. The client enters the primary email, or an additional email, to open the portal.
      </p>
      {url ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            id={`personal-link-${clientId}`}
            aria-labelledby={`personal-link-label-${clientId}`}
            className="input font-mono text-xs"
            readOnly
            spellCheck={false}
            autoComplete="off"
            value={url}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button type="button" className="btn-secondary shrink-0 px-3 py-2" onClick={() => { void copy() }}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-brand-muted">
          This link can&apos;t be shown. Reset it to make a new one. Resetting turns off the current link.
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {confirming ? (
          <>
            <span className="text-sm text-brand-muted">The current link stops working immediately.</span>
            <button type="button" className="btn-secondary px-3 py-2" disabled={saving} onClick={() => { void reset() }}>
              {saving ? 'Resetting…' : 'Confirm reset'}
            </button>
            <button
              type="button"
              className="text-sm text-brand-dark underline"
              disabled={saving}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="btn-secondary px-3 py-2" onClick={() => setConfirming(true)}>
            Reset link
          </button>
        )}
      </div>
      {!active && (
        <p className="mt-2 text-xs text-brand-muted">Inactive — this link won&apos;t sign anyone in until the client is active again.</p>
      )}
      {notice && <p className="mt-2 text-sm text-brand-muted" role="status">{notice}</p>}
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
        <Field label="Primary email" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
        <div className="sm:col-span-2 space-y-2">
          <span className="font-medium">Also on this account</span>
          <p className="text-xs text-brand-muted">
            Each address can sign in, and Acuity bookings from any of them count toward this client. An email can only belong to one client.
          </p>
          {form.additionalEmails.map((value, index) => (
            <div key={index} className="flex gap-2">
              <input
                className="input"
                type="email"
                inputMode="email"
                autoComplete="off"
                spellCheck={false}
                placeholder="name@example.com"
                aria-label={`Additional email ${index + 1}`}
                value={value}
                onChange={(event) => {
                  const additionalEmails = [...form.additionalEmails]
                  additionalEmails[index] = event.target.value
                  setForm({ ...form, additionalEmails })
                }}
              />
              <button
                type="button"
                className="text-sm text-brand-dark underline shrink-0"
                onClick={() =>
                  setForm({
                    ...form,
                    additionalEmails: form.additionalEmails.filter((_, item) => item !== index),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-sm text-brand-dark underline"
            onClick={() => setForm({ ...form, additionalEmails: [...form.additionalEmails, ''] })}
          >
            Add email
          </button>
        </div>
        <Field label="Company" value={form.company} onChange={(company) => setForm({ ...form, company })} />
        <label className="block text-sm">
          <span className="font-medium">Client type</span>
          <select
            className="input mt-1.5"
            value={form.kind}
            onChange={(event) => setForm({ ...form, kind: event.target.value as ClientKind })}
          >
            <option value="subscription">Subscription</option>
            <option value="project">Per project</option>
          </select>
        </label>
        {form.kind === 'subscription' && (
          <>
            <label className="block text-sm">
              <span className="font-medium">Plan</span>
              <select
                className="input mt-1.5"
                value={form.planSize}
                onChange={(event) => setForm({ ...form, planSize: Number(event.target.value) as PlanSize })}
              >
                <option value={1}>1 shoot / month</option>
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
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium">Scheduling link</span>
              <input
                className="input mt-1.5"
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://… include the package code"
                value={form.schedulingLink}
                onChange={(event) => setForm({ ...form, schedulingLink: event.target.value })}
              />
              <span className="mt-1 block text-xs text-brand-muted">
                Private to this client. Leave it blank and the portal asks them to contact you instead of opening the paid scheduler.
              </span>
            </label>
          </>
        )}
        {form.kind === 'project' && (
          <p className="text-sm text-brand-muted sm:col-span-2">
            Per-project clients use the shared scheduler at primavisual.as.me. Their name and email are filled in. No plan or renewal.
          </p>
        )}
        <label className="flex items-center gap-2 text-sm mt-6">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) => setForm({ ...form, active: event.target.checked })}
          />
          Active — can sign in
        </label>
      </div>

      <label className="block text-sm" htmlFor="frameio-url">
        <span className="font-medium">Frame.io link</span>
        <input
          id="frameio-url"
          className="input mt-1.5"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://app.frame.io/..."
          value={form.frameioUrl}
          onChange={(event) => setForm({ ...form, frameioUrl: event.target.value })}
        />
        <span className="mt-1 block text-xs text-brand-muted">
          One shared link for all of this client&apos;s footage. Leave it blank until the films are ready.
        </span>
      </label>

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
