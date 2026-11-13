'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function PriceField({
  label,
  planSize,
  clientId,
  dollars,
}: {
  label: string
  planSize?: 1 | 2 | 4
  clientId?: number
  dollars: number | null
}) {
  const router = useRouter()
  const [value, setValue] = useState(dollars == null ? '' : String(dollars))
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  return (
    <form
      className="hub-row"
      onSubmit={async (event) => {
        event.preventDefault()
        setPending(true)
        setError(null)
        const payload =
          planSize != null
            ? { planSize, monthlyDollars: value.trim() === '' ? null : Number(value) }
            : { clientId, monthlyDollars: value.trim() === '' ? null : Number(value) }
        try {
          const response = await fetch('/api/hub/prices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
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
      }}
    >
      <label className="hub-label" style={{ flex: 1 }}>
        {label}
        <input
          className="hub-input"
          inputMode="numeric"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label={label}
        />
      </label>
      <button className="hub-btn" type="submit" disabled={pending}>
        Save
      </button>
      {error && <p className="hub-error">{error}</p>}
    </form>
  )
}
