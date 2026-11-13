'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { HubClientCard } from '@/lib/hub/workspace'
import { formatDollars } from '@/lib/hub/money'

export default function ClientCard({ client }: { client: HubClientCard }) {
  const router = useRouter()
  const [kind, setKind] = useState(client.kind)
  const [plan, setPlan] = useState<1 | 2 | 4>(client.planSize === 2 || client.planSize === 4 ? client.planSize : 1)
  const [active, setActive] = useState(client.active)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function send(method: 'PATCH' | 'DELETE', body: unknown) {
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/hub/clients/${client.id}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not save.')
        return false
      }
      router.refresh()
      return true
    } catch {
      setError('Could not save.')
      return false
    } finally {
      setPending(false)
    }
  }

  async function toggle() {
    const next = !active
    const ok = await send('PATCH', { active: next })
    if (ok) setActive(next)
  }

  return (
    <article className={client.renewalSoon && active ? 'hub-card hub-soon' : 'hub-card'}>
      <div className="hub-card-top">
        <h2>{client.name}</h2>
        <button type="button" className="hub-chip" disabled={pending} aria-pressed={active} onClick={() => void toggle()}>
          {active ? 'Active' : 'Inactive'}
        </button>
      </div>
      <p className="hub-note">{client.company || client.email}</p>
      {client.kind === 'subscription' && (
        <>
          <p className="hub-note">
            {client.planSize ?? '—'}/month · {client.used} used · {client.remaining} left
          </p>
          <p className={client.renewalSoon && active ? 'hub-warn' : 'hub-muted'}>
            {client.renewalLabel ? `Renews ${client.renewalLabel}` : 'No renewal date'}
            {client.renewalSoon && active ? ' · within 14 days' : ''}
          </p>
          <p className="hub-muted">
            Monthly price {formatDollars(client.monthlyDollars)}
            {client.priceSource === 'client' ? ' · this client' : client.priceSource === 'plan' ? ' · plan default' : ' · not set'}
          </p>
        </>
      )}
      <details className="hub-fold">
        <summary className="hub-chip">Edit</summary>
        <form
          className="hub-stack"
          onSubmit={async (event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            const ok = await send('PATCH', {
              name: String(form.get('name') ?? ''),
              email: String(form.get('email') ?? ''),
              additionalEmails: String(form.get('additionalEmails') ?? ''),
              company: String(form.get('company') ?? ''),
              kind,
              planSize: kind === 'subscription' ? plan : null,
              renewalDate: kind === 'subscription' ? String(form.get('renewalDate') ?? '') : null,
              schedulingLink: String(form.get('schedulingLink') ?? ''),
              frameioUrl: String(form.get('frameioUrl') ?? ''),
              notionClientId: String(form.get('notionClientId') ?? ''),
              active,
              monthlyDollars: kind === 'subscription' ? String(form.get('monthlyDollars') ?? '') : null,
            })
            if (ok) event.currentTarget.closest('details')?.removeAttribute('open')
          }}
        >
          <label className="hub-label" htmlFor={`name-${client.id}`}>
            Name
            <input id={`name-${client.id}`} name="name" className="hub-input" defaultValue={client.name} required />
          </label>
          <label className="hub-label" htmlFor={`email-${client.id}`}>
            Email
            <input id={`email-${client.id}`} name="email" className="hub-input" type="email" defaultValue={client.email} required />
          </label>
          <label className="hub-label" htmlFor={`extra-${client.id}`}>
            Extra emails
            <textarea
              id={`extra-${client.id}`}
              name="additionalEmails"
              className="hub-textarea"
              defaultValue={client.additionalEmails.join('\n')}
              placeholder="One address per line"
            />
          </label>
          <label className="hub-label" htmlFor={`company-${client.id}`}>
            Company
            <input id={`company-${client.id}`} name="company" className="hub-input" defaultValue={client.company} />
          </label>
          <div className="hub-actions" aria-label="Kind">
            <button type="button" className="hub-chip" aria-pressed={kind === 'subscription'} onClick={() => setKind('subscription')}>
              Subscription
            </button>
            <button type="button" className="hub-chip" aria-pressed={kind === 'project'} onClick={() => setKind('project')}>
              Project
            </button>
          </div>
          {kind === 'subscription' && (
            <>
              <div className="hub-actions" aria-label="Plan">
                {([1, 2, 4] as const).map((size) => (
                  <button key={size} type="button" className="hub-chip" aria-pressed={plan === size} onClick={() => setPlan(size)}>
                    {size} / month
                  </button>
                ))}
              </div>
              <label className="hub-label" htmlFor={`renewal-${client.id}`}>
                Renewal date
                <input
                  id={`renewal-${client.id}`}
                  name="renewalDate"
                  className="hub-input"
                  type="date"
                  defaultValue={client.renewalDate}
                  required
                />
              </label>
              <label className="hub-label" htmlFor={`price-${client.id}`}>
                Monthly price
                <input
                  id={`price-${client.id}`}
                  name="monthlyDollars"
                  className="hub-input"
                  inputMode="numeric"
                  defaultValue={client.monthlyDollars ?? ''}
                />
              </label>
            </>
          )}
          <label className="hub-label" htmlFor={`schedule-${client.id}`}>
            Scheduling link
            <input id={`schedule-${client.id}`} name="schedulingLink" className="hub-input" defaultValue={client.schedulingLink ?? ''} />
          </label>
          <label className="hub-label" htmlFor={`frame-${client.id}`}>
            Frame.io link
            <input id={`frame-${client.id}`} name="frameioUrl" className="hub-input" defaultValue={client.frameioUrl ?? ''} />
          </label>
          <label className="hub-label" htmlFor={`notion-${client.id}`}>
            Notion client link
            <input id={`notion-${client.id}`} name="notionClientId" className="hub-input" defaultValue={client.notionClientId ?? ''} />
          </label>
          <button className="hub-btn" type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save client'}
          </button>
        </form>
      </details>
      <details className="hub-fold">
        <summary className="hub-chip">Delete</summary>
        <form
          className="hub-stack"
          onSubmit={async (event) => {
            event.preventDefault()
            const ok = await send('DELETE', { confirmName: typed })
            if (ok) event.currentTarget.closest('details')?.removeAttribute('open')
          }}
        >
          <p className="hub-note">
            Deleting removes {client.name} from the roster. Their appointments and briefs stay, so shoot history and the review queue are not erased. Making them inactive is the gentler option: they drop out of revenue and cannot sign in, and you can turn them back on.
          </p>
          <button
            type="button"
            className="hub-btn hub-btn-ghost"
            disabled={pending || !active}
            onClick={async (click) => {
              const ok = await send('PATCH', { active: false })
              if (ok) {
                setActive(false)
                click.currentTarget.closest('details')?.removeAttribute('open')
              }
            }}
          >
            Make inactive instead
          </button>
          <label className="hub-label" htmlFor={`confirm-${client.id}`}>
            Type {client.name} to delete
            <input id={`confirm-${client.id}`} className="hub-input" value={typed} onChange={(event) => setTyped(event.target.value)} />
          </label>
          <button className="hub-btn" type="submit" disabled={pending || typed.trim() !== client.name.trim()}>
            {pending ? 'Deleting…' : 'Delete client'}
          </button>
        </form>
      </details>
      {error && <p className="hub-error">{error}</p>}
    </article>
  )
}
