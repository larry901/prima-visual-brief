'use client'

import { useState, type FormEvent } from 'react'

export default function PersonalLinkSignIn({ token }: { token: string }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/portal/personal-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        const message = data && typeof data.error === 'string' ? data.error : 'Something went wrong. Try again.'
        setError(message)
        setLoading(false)
        return
      }
      window.location.assign('/portal')
    } catch {
      setError('Something went wrong. Try again.')
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
        <p className="portal-lede">Enter the email on your Prima Visual account.</p>
        <form onSubmit={submit} className="portal-stack">
          <label className="portal-label" htmlFor="personal-link-email">Email</label>
          <input
            id="personal-link-email"
            className="portal-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@yourbrokerage.com"
          />
          {error && <p className="portal-error" role="alert">{error}</p>}
          <button className="portal-btn" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <a className="portal-text-link" href="/portal">Use a one-time email link instead</a>
      </div>
    </main>
  )
}
