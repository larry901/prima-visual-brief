'use client'

import { useState, type FormEvent } from 'react'

export default function PortalLogin({ error }: { error: string | null }) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [demoUrl, setDemoUrl] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(error)
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setFormError(null)
    setMessage(null)
    setDemoUrl(null)
    try {
      const response = await fetch('/api/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await response.json()
      if (!response.ok) {
        setFormError(data.error || 'Something went wrong.')
        return
      }
      setMessage(data.message)
      if (typeof data.demoUrl === 'string') setDemoUrl(data.demoUrl)
    } catch {
      setFormError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="portal-shell">
      <header className="portal-top">
        <p className="portal-wordmark">Prima Visual</p>
      </header>
      <div className="portal-login">
        <p className="portal-kicker">Client portal</p>
        <h1>Sign in</h1>
        <p className="portal-lede">
          Use any email on your account. We&apos;ll send a one-time link. No password.
        </p>
        <form onSubmit={submit} className="portal-stack">
          <label className="portal-label" htmlFor="portal-email">Email</label>
          <input
            id="portal-email"
            className="portal-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@yourbrokerage.com"
          />
          {formError && <p className="portal-error">{formError}</p>}
          {message && <p className="portal-note">{message}</p>}
          {demoUrl && (
            <a className="portal-btn portal-btn-link" href={demoUrl}>
              Open demo sign-in link
            </a>
          )}
          <button className="portal-btn" type="submit" disabled={loading}>
            {loading ? 'Sending…' : 'Email me a link'}
          </button>
        </form>
      </div>
    </main>
  )
}
