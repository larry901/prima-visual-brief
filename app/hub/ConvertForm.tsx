'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function ConvertForm({
  leadId,
  kind,
  planSize,
  renewalDate,
  convertedClientId,
}: {
  leadId: number
  kind: 'subscription' | 'project'
  planSize: 1 | 2 | 4
  renewalDate: string
  convertedClientId: number | null
}) {
  const router = useRouter()
  const [service, setService] = useState(kind)
  const [plan, setPlan] = useState<1 | 2 | 4>(planSize)
  const [renewal, setRenewal] = useState(renewalDate)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState<number | null>(convertedClientId)

  if (done) {
    return (
      <p className="hub-note">
        On the roster.{' '}
        <a className="hub-link" href="/dashboard/clients">
          Open clients
        </a>
      </p>
    )
  }

  return (
    <form
      className="hub-stack"
      onSubmit={async (event) => {
        event.preventDefault()
        setPending(true)
        setError(null)
        try {
          const response = await fetch(`/api/hub/leads/${leadId}/convert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              kind: service,
              planSize: service === 'subscription' ? plan : null,
              renewalDate: service === 'subscription' ? renewal : null,
            }),
          })
          const data = await response.json().catch(() => ({}))
          if (!response.ok) {
            setError(typeof data.error === 'string' ? data.error : 'Could not add the client.')
            return
          }
          setDone(Number(data.clientId))
          router.refresh()
        } catch {
          setError('Could not add the client.')
        } finally {
          setPending(false)
        }
      }}
    >
      <p className="hub-muted">Adds a roster client from this lead. Nothing is emailed.</p>
      <div className="hub-actions">
        <button type="button" className="hub-chip" aria-pressed={service === 'subscription'} onClick={() => setService('subscription')}>
          Subscription
        </button>
        <button type="button" className="hub-chip" aria-pressed={service === 'project'} onClick={() => setService('project')}>
          Project
        </button>
      </div>
      {service === 'subscription' && (
        <>
          <div className="hub-actions" aria-label="Plan">
            {([1, 2, 4] as const).map((size) => (
              <button key={size} type="button" className="hub-chip" aria-pressed={plan === size} onClick={() => setPlan(size)}>
                {size} / month
              </button>
            ))}
          </div>
          <label className="hub-label" htmlFor="convert-renewal">
            Renewal date
            <input
              id="convert-renewal"
              className="hub-input"
              type="date"
              value={renewal}
              onChange={(event) => setRenewal(event.target.value)}
              required
            />
          </label>
        </>
      )}
      {error && <p className="hub-error">{error}</p>}
      <button className="hub-btn hub-btn-block" type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add to roster'}
      </button>
    </form>
  )
}
