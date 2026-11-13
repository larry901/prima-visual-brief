'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
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
  active: boolean
}

const empty = (): Draft => ({
  name: '',
  email: '',
  additionalEmails: [],
  company: '',
  kind: 'subscription',
  planSize: 2,
  renewalDate: '',
  schedulingLink: '',
  frameioUrl: '',
  notionClient: '',
  monthlyPrice: '',
  active: true,
})

function parseMonthly(value: string): number | null | 'bad' {
  const trimmed = value.trim()
  if (!trimmed) return null
  const numeric = Number(trimmed.replace(/[$,\s]/g, ''))
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1_000_000) return 'bad'
  return Math.round(numeric)
}

async function readError(response: Response, fallback: string): Promise<string> {
  const data = await response.json().catch(() => null)
  return data && typeof data.error === 'string' ? data.error : fallback
}

export default function AddClientForm({ onCreated }: { onCreated: () => void }) {
  const router = useRouter()
  const [form, setForm] = useState<Draft>(empty)
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
        const price = form.kind === 'subscription' ? parseMonthly(form.monthlyPrice) : null
        if (price === 'bad') {
          setError('Monthly price must be a dollar amount from 0 to 1,000,000.')
          setSaving(false)
          return
        }
        try {
          const response = await fetch('/api/dashboard/clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: form.name,
              email: form.email,
              additionalEmails: form.additionalEmails,
              company: form.company,
              kind: form.kind,
              planSize: form.planSize,
              renewalDate: form.renewalDate,
              schedulingLink: form.schedulingLink,
              active: form.active,
              frameioUrl: form.frameioUrl,
              notionClient: form.notionClient,
            }),
          })
          if (!response.ok) throw new Error(await readError(response, 'Could not add the client.'))
          const data = (await response.json()) as { client?: { id?: number } }
          const clientId = data.client?.id
          if (form.kind === 'subscription' && clientId != null) {
            const priced = await fetch('/api/hub/prices', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientId, monthlyDollars: price }),
            })
            if (!priced.ok) throw new Error(await readError(priced, 'The client was added, but the monthly price was not.'))
          }
          setForm(empty())
          onCreated()
          router.refresh()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not add the client.')
        } finally {
          setSaving(false)
        }
      }}
    >
      <p className="hub-muted">Same fields as the roster. Nothing is emailed.</p>
      <label className="hub-label" htmlFor="add-name">
        Name
        <input id="add-name" className="hub-input" value={form.name} onChange={(event) => set({ name: event.target.value })} required />
      </label>
      <label className="hub-label" htmlFor="add-email">
        Email
        <input
          id="add-email"
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
        <button className="hub-btn hub-btn-ghost" type="button" onClick={() => set({ additionalEmails: [...form.additionalEmails, ''] })}>
          Add email
        </button>
      </div>
      <label className="hub-label" htmlFor="add-company">
        Company
        <input id="add-company" className="hub-input" value={form.company} onChange={(event) => set({ company: event.target.value })} />
      </label>
      <label className="hub-label" htmlFor="add-kind">
        Plan type
        <select
          id="add-kind"
          className="hub-select"
          value={form.kind}
          onChange={(event) => set({ kind: event.target.value as ClientKind })}
        >
          <option value="subscription">Subscription</option>
          <option value="project">Per project</option>
        </select>
      </label>
      {form.kind === 'subscription' && (
        <>
          <label className="hub-label" htmlFor="add-plan">
            Shoots per cycle
            <select
              id="add-plan"
              className="hub-select"
              value={form.planSize}
              onChange={(event) => set({ planSize: Number(event.target.value) as PlanSize })}
            >
              <option value={1}>1 shoot / month</option>
              <option value={2}>2 shoots / month</option>
              <option value={4}>4 shoots / month</option>
            </select>
          </label>
          <label className="hub-label" htmlFor="add-renewal">
            Renewal date
            <input
              id="add-renewal"
              className="hub-input"
              type="date"
              required
              value={form.renewalDate}
              onChange={(event) => set({ renewalDate: event.target.value })}
            />
          </label>
          <label className="hub-label" htmlFor="add-price">
            Monthly price
            <input
              id="add-price"
              className="hub-input"
              inputMode="decimal"
              value={form.monthlyPrice}
              onChange={(event) => set({ monthlyPrice: event.target.value })}
              placeholder="Plan default if blank"
            />
          </label>
        </>
      )}
      <label className="hub-label" htmlFor="add-schedule">
        Scheduling link
        <input
          id="add-schedule"
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
      <label className="hub-label" htmlFor="add-frame">
        Frame.io link
        <input
          id="add-frame"
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
      <label className="hub-label" htmlFor="add-notion">
        Notion client link
        <input
          id="add-notion"
          className="hub-input"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://www.notion.so/…"
          value={form.notionClient}
          onChange={(event) => set({ notionClient: event.target.value })}
        />
      </label>
      <label className="hub-label" htmlFor="add-active">
        <span className="hub-row">
          <input
            id="add-active"
            type="checkbox"
            checked={form.active}
            onChange={(event) => set({ active: event.target.checked })}
          />
          Active — can sign in
        </span>
      </label>
      {error && <p className="hub-error">{error}</p>}
      <button className="hub-btn hub-btn-block" type="submit" disabled={saving}>
        {saving ? 'Adding…' : 'Add client'}
      </button>
    </form>
  )
}
