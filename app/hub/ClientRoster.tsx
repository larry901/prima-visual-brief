'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { partitionClients, type HubClientCard } from '@/lib/hub/client-card'
import { formatDollars } from '@/lib/hub/money'
import type { ClientKind, PlanSize } from '@/lib/portal/types'

interface Draft {
  name: string
  email: string
  additionalEmails: string[]
  company: string
  kind: ClientKind
  planSize: PlanSize
  renewalDate: string
  schedulingLink: string
  frameioUrl: string
  notionClient: string
  monthlyPrice: string
}

function draftFrom(client: HubClientCard): Draft {
  return {
    name: client.name,
    email: client.email,
    additionalEmails: [...client.additionalEmails],
    company: client.company,
    kind: client.kind,
    planSize: client.planSize ?? 2,
    renewalDate: client.renewalDate,
    schedulingLink: client.schedulingLink ?? '',
    frameioUrl: client.frameioUrl ?? '',
    notionClient: client.notionClientId ?? '',
    monthlyPrice: client.monthlyDollars == null ? '' : String(client.monthlyDollars),
  }
}

function rosterBody(client: HubClientCard, active: boolean) {
  return {
    name: client.name,
    email: client.email,
    additionalEmails: client.additionalEmails,
    company: client.company,
    kind: client.kind,
    planSize: client.planSize ?? 2,
    renewalDate: client.renewalDate,
    schedulingLink: client.schedulingLink ?? '',
    active,
    frameioUrl: client.frameioUrl ?? '',
    notionClient: client.notionClientId ?? '',
  }
}

async function readError(response: Response, fallback: string): Promise<string> {
  const data = await response.json().catch(() => null)
  return data && typeof data.error === 'string' ? data.error : fallback
}

export default function ClientRoster({ clients }: { clients: HubClientCard[] }) {
  const router = useRouter()
  const { subscribers, projects, inactive } = partitionClients(clients)
  const unused = subscribers.reduce((sum, client) => sum + client.remaining, 0)
  const [inactiveOpen, setInactiveOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [error, setError] = useState<{ id: number; message: string } | null>(null)

  const setActive = async (client: HubClientCard, active: boolean) => {
    setPendingId(client.id)
    setError(null)
    try {
      const response = await fetch(`/api/dashboard/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rosterBody(client, active)),
      })
      if (!response.ok) {
        setError({ id: client.id, message: await readError(response, 'Could not update the client.') })
        return
      }
      if (!active) setInactiveOpen(true)
      setEditingId(null)
      router.refresh()
    } catch {
      setError({ id: client.id, message: 'Could not update the client.' })
    } finally {
      setPendingId(null)
    }
  }

  const save = async (client: HubClientCard, draft: Draft) => {
    const price = draft.kind === 'subscription' ? parseMonthly(draft.monthlyPrice) : null
    if (price === 'bad') throw new Error('Monthly price must be a dollar amount from 0 to 1,000,000.')
    const response = await fetch(`/api/dashboard/clients/${client.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: draft.name,
        email: draft.email,
        additionalEmails: draft.additionalEmails,
        company: draft.company,
        kind: draft.kind,
        planSize: draft.planSize,
        renewalDate: draft.renewalDate,
        schedulingLink: draft.schedulingLink,
        active: client.active,
        frameioUrl: draft.frameioUrl,
        notionClient: draft.notionClient,
      }),
    })
    if (!response.ok) throw new Error(await readError(response, 'Could not save the client.'))
    if (draft.kind === 'subscription') {
      const priced = await fetch('/api/hub/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, monthlyDollars: price }),
      })
      if (!priced.ok) throw new Error(await readError(priced, 'The client was saved, but the monthly price was not.'))
    }
    setEditingId(null)
    router.refresh()
  }

  const remove = async (client: HubClientCard, confirmName: string) => {
    setPendingId(client.id)
    setError(null)
    try {
      const response = await fetch(`/api/dashboard/clients/${client.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName }),
      })
      if (!response.ok) {
        setError({ id: client.id, message: await readError(response, 'Could not delete the client.') })
        return false
      }
      setEditingId(null)
      router.refresh()
      return true
    } catch {
      setError({ id: client.id, message: 'Could not delete the client.' })
      return false
    } finally {
      setPendingId(null)
    }
  }

  const renderCard = (client: HubClientCard) => (
    <ClientCard
      key={client.id}
      client={client}
      editing={editingId === client.id}
      pending={pendingId === client.id}
      error={error?.id === client.id ? error.message : null}
      onEdit={() => {
        setError(null)
        setEditingId(editingId === client.id ? null : client.id)
      }}
      onToggle={(active) => void setActive(client, active)}
      onSave={(draft) => save(client, draft)}
      onDelete={(confirmName) => remove(client, confirmName)}
    />
  )

  return (
    <>
      <p className="hub-kicker">Roster</p>
      <h1>Clients</h1>
      <p className="hub-date">
        {unused} unused subscription shoot{unused === 1 ? '' : 's'} this cycle. Renewals in the next 14 days are marked.
        Inactive clients are left out of revenue, subscriber counts, renewals, and unused shoots.
      </p>
      <p className="hub-muted">
        <a className="hub-link" href="/dashboard/clients">
          Open the full roster
        </a>
      </p>

      <section className="hub-section" aria-labelledby="subscribers">
        <h2 id="subscribers">Subscribers · {subscribers.length}</h2>
        {subscribers.length === 0 ? (
          <p className="hub-muted">No active subscribers.</p>
        ) : (
          <ul className="hub-stack" style={{ marginTop: 12, padding: 0, listStyle: 'none' }}>
            {subscribers.map(renderCard)}
          </ul>
        )}
      </section>

      <section className="hub-section" aria-labelledby="projects">
        <h2 id="projects">Per project · {projects.length}</h2>
        {projects.length === 0 ? (
          <p className="hub-muted">No active per-project clients.</p>
        ) : (
          <ul className="hub-stack" style={{ marginTop: 12, padding: 0, listStyle: 'none' }}>
            {projects.map(renderCard)}
          </ul>
        )}
      </section>

      {inactive.length > 0 && (
        <details
          className="hub-details"
          open={inactiveOpen}
          onToggle={(event) => setInactiveOpen(event.currentTarget.open)}
        >
          <summary>
            <h2>Inactive · {inactive.length}</h2>
          </summary>
          <ul className="hub-stack" style={{ marginTop: 12, padding: 0, listStyle: 'none' }}>
            {inactive.map(renderCard)}
          </ul>
        </details>
      )}
    </>
  )
}

function parseMonthly(value: string): number | null | 'bad' {
  const trimmed = value.trim()
  if (!trimmed) return null
  const numeric = Number(trimmed.replace(/[$,\s]/g, ''))
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1_000_000) return 'bad'
  return Math.round(numeric)
}

function ClientCard({
  client,
  editing,
  pending,
  error,
  onEdit,
  onToggle,
  onSave,
  onDelete,
}: {
  client: HubClientCard
  editing: boolean
  pending: boolean
  error: string | null
  onEdit: () => void
  onToggle: (active: boolean) => void
  onSave: (draft: Draft) => Promise<void>
  onDelete: (confirmName: string) => Promise<boolean>
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <li className={client.renewalSoon ? 'hub-card hub-soon' : 'hub-card'}>
      <div className="hub-card-top">
        <h2>{client.name}</h2>
        <p className="hub-muted">{client.kind === 'subscription' ? 'Subscription' : 'Project'}</p>
      </div>
      <p className="hub-note">{client.company || client.email}</p>
      {client.kind === 'subscription' && (
        <>
          <p className="hub-note">
            {client.planSize ?? '—'}/month · {client.used} used · {client.remaining} left
          </p>
          <p className={client.renewalSoon ? 'hub-warn' : 'hub-muted'}>
            {client.renewalLabel ? `Renews ${client.renewalLabel}` : 'No renewal date'}
            {client.renewalSoon ? ' · within 14 days' : ''}
          </p>
          <p className="hub-muted">
            Monthly price {formatDollars(client.monthlyDollars)}
            {client.priceSource === 'client' ? ' · this client' : client.priceSource === 'plan' ? ' · plan default' : ' · not set'}
          </p>
        </>
      )}
      <div className="hub-actions">
        <button
          className="hub-btn"
          type="button"
          onClick={() => {
            setConfirming(false)
            onEdit()
          }}
          disabled={pending}
        >
          {editing ? 'Close' : 'Edit'}
        </button>
        <button className="hub-btn hub-btn-ghost" type="button" onClick={() => onToggle(!client.active)} disabled={pending}>
          {pending ? 'Saving…' : client.active ? 'Mark inactive' : 'Mark active'}
        </button>
        <button
          className="hub-btn hub-btn-danger"
          type="button"
          onClick={() => {
            if (editing) onEdit()
            setConfirming((open) => !open)
          }}
          disabled={pending}
        >
          {confirming ? 'Close' : 'Delete'}
        </button>
      </div>
      {error && !editing && !confirming && <p className="hub-error">{error}</p>}
      {editing && <ClientEditor client={client} pending={pending} onSave={onSave} />}
      {confirming && (
        <DeleteDialog
          client={client}
          pending={pending}
          error={error}
          onCancel={() => setConfirming(false)}
          onInactive={() => onToggle(false)}
          onDelete={async (name) => {
            const gone = await onDelete(name)
            if (gone) setConfirming(false)
          }}
        />
      )}
    </li>
  )
}

function ClientEditor({
  client,
  pending,
  onSave,
}: {
  client: HubClientCard
  pending: boolean
  onSave: (draft: Draft) => Promise<void>
}) {
  const [form, setForm] = useState<Draft>(draftFrom(client))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<Draft>) => setForm((current) => ({ ...current, ...patch }))

  return (
    <form
      className="hub-stack"
      onSubmit={async (event) => {
        event.preventDefault()
        setSaving(true)
        setError(null)
        try {
          await onSave(form)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not save the client.')
        } finally {
          setSaving(false)
        }
      }}
    >
      <label className="hub-label" htmlFor={`name-${client.id}`}>
        Name
        <input
          id={`name-${client.id}`}
          className="hub-input"
          value={form.name}
          onChange={(event) => set({ name: event.target.value })}
          required
        />
      </label>
      <label className="hub-label" htmlFor={`email-${client.id}`}>
        Email
        <input
          id={`email-${client.id}`}
          className="hub-input"
          type="email"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          value={form.email}
          onChange={(event) => set({ email: event.target.value })}
          required
        />
      </label>
      <div className="hub-stack">
        <span className="hub-label">Also on this account</span>
        {form.additionalEmails.map((value, index) => (
          <div key={index} className="hub-row">
            <input
              className="hub-input"
              type="email"
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              aria-label={`Additional email ${index + 1}`}
              placeholder="name@example.com"
              value={value}
              onChange={(event) => {
                const additionalEmails = [...form.additionalEmails]
                additionalEmails[index] = event.target.value
                set({ additionalEmails })
              }}
            />
            <button
              className="hub-btn hub-btn-ghost"
              type="button"
              onClick={() => set({ additionalEmails: form.additionalEmails.filter((_, item) => item !== index) })}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          className="hub-btn hub-btn-ghost"
          type="button"
          onClick={() => set({ additionalEmails: [...form.additionalEmails, ''] })}
        >
          Add email
        </button>
      </div>
      <label className="hub-label" htmlFor={`company-${client.id}`}>
        Company
        <input
          id={`company-${client.id}`}
          className="hub-input"
          value={form.company}
          onChange={(event) => set({ company: event.target.value })}
        />
      </label>
      <label className="hub-label" htmlFor={`kind-${client.id}`}>
        Kind
        <select
          id={`kind-${client.id}`}
          className="hub-select"
          value={form.kind}
          onChange={(event) => set({ kind: event.target.value as ClientKind })}
        >
          <option value="subscription">Subscription</option>
          <option value="project">Project</option>
        </select>
      </label>
      {form.kind === 'subscription' && (
        <>
          <label className="hub-label" htmlFor={`plan-${client.id}`}>
            Plan size
            <select
              id={`plan-${client.id}`}
              className="hub-select"
              value={form.planSize}
              onChange={(event) => set({ planSize: Number(event.target.value) as PlanSize })}
            >
              <option value={1}>1 shoot / month</option>
              <option value={2}>2 shoots / month</option>
              <option value={4}>4 shoots / month</option>
            </select>
          </label>
          <label className="hub-label" htmlFor={`renewal-${client.id}`}>
            Renewal date
            <input
              id={`renewal-${client.id}`}
              className="hub-input"
              type="date"
              required
              value={form.renewalDate}
              onChange={(event) => set({ renewalDate: event.target.value })}
            />
          </label>
          <label className="hub-label" htmlFor={`price-${client.id}`}>
            Monthly price
            <input
              id={`price-${client.id}`}
              className="hub-input"
              inputMode="decimal"
              value={form.monthlyPrice}
              onChange={(event) => set({ monthlyPrice: event.target.value })}
              placeholder="Plan default if blank"
              aria-describedby={`price-help-${client.id}`}
            />
          </label>
          <p id={`price-help-${client.id}`} className="hub-muted">
            Whole dollars for this client. Blank uses the plan price on KPIs. Inactive clients are not counted.
          </p>
        </>
      )}
      <label className="hub-label" htmlFor={`schedule-${client.id}`}>
        Scheduling link
        <input
          id={`schedule-${client.id}`}
          className="hub-input"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://…"
          value={form.schedulingLink}
          onChange={(event) => set({ schedulingLink: event.target.value })}
        />
      </label>
      <label className="hub-label" htmlFor={`frame-${client.id}`}>
        Frame.io link
        <input
          id={`frame-${client.id}`}
          className="hub-input"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://app.frame.io/…"
          value={form.frameioUrl}
          onChange={(event) => set({ frameioUrl: event.target.value })}
        />
      </label>
      <label className="hub-label" htmlFor={`notion-${client.id}`}>
        Notion client link
        <input
          id={`notion-${client.id}`}
          className="hub-input"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://www.notion.so/…"
          value={form.notionClient}
          onChange={(event) => set({ notionClient: event.target.value })}
        />
      </label>
      {error && <p className="hub-error">{error}</p>}
      <button className="hub-btn hub-btn-block" type="submit" disabled={saving || pending}>
        {saving ? 'Saving…' : 'Save client'}
      </button>
    </form>
  )
}

function DeleteDialog({
  client,
  pending,
  error,
  onCancel,
  onInactive,
  onDelete,
}: {
  client: HubClientCard
  pending: boolean
  error: string | null
  onCancel: () => void
  onInactive: () => void
  onDelete: (confirmName: string) => Promise<void>
}) {
  const [typed, setTyped] = useState('')
  const expected = client.name.trim()
  const matches = typed.trim() === expected
  return (
    <form
      className="hub-stack"
      role="dialog"
      aria-labelledby={`delete-${client.id}`}
      onSubmit={async (event) => {
        event.preventDefault()
        if (!matches) return
        await onDelete(typed.trim())
      }}
    >
      <p id={`delete-${client.id}`} className="hub-note">
        Deleting removes {client.name} from the roster. Their shoots stay in the history and the needs-review queue,
        and their briefs stay on the dashboard. Marking them inactive is the gentler option: they drop out of revenue
        and renewals, and they still cannot sign in.
      </p>
      {client.active && (
        <button className="hub-btn hub-btn-block" type="button" onClick={onInactive} disabled={pending}>
          {pending ? 'Saving…' : 'Mark inactive instead'}
        </button>
      )}
      {!client.active && <p className="hub-muted">This client is already inactive.</p>}
      <label className="hub-label" htmlFor={`confirm-${client.id}`}>
        Type {expected} to delete
        <input
          id={`confirm-${client.id}`}
          className="hub-input"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {error && <p className="hub-error">{error}</p>}
      <div className="hub-actions">
        <button className="hub-btn hub-btn-danger" type="submit" disabled={!matches || pending}>
          {pending ? 'Deleting…' : 'Delete client'}
        </button>
        <button className="hub-btn hub-btn-ghost" type="button" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  )
}
