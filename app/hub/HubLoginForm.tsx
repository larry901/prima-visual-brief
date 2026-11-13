'use client'

import { useState, type FormEvent } from 'react'

export default function HubLoginForm({ error }: { error: string | null }) {
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
      const response = await fetch('/api/hub/login', {
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
    <main className="hub-login">
      <p className="hub-wordmark">Prima Hub</p>
      <p className="hub-kicker">Staff</p>
      <h1>Sign in</h1>
      <p className="hub-note">
        Use your staff email. We send a one-time link. The hub does not use the client portal sign-in.
      </p>
      <form onSubmit={submit} className="hub-stack" style={{ marginTop: 24 }}>
        <label className="hub-label" htmlFor="hub-email">
          Email
          <input
            id="hub-email"
            className="hub-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        {formError && <p className="hub-error">{formError}</p>}
        {message && <p className="hub-note">{message}</p>}
        {demoUrl && (
          <a className="hub-btn hub-btn-block" href={demoUrl}>
            Open demo sign-in link
          </a>
        )}
        <button className="hub-btn hub-btn-block" type="submit" disabled={loading}>
          {loading ? 'Sending…' : 'Email me a link'}
        </button>
      </form>
    </main>
  )
}
