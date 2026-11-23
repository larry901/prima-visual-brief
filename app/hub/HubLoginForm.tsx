'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'

export default function HubLoginForm({ error }: { error: string | null }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [demoUrl, setDemoUrl] = useState<string | null>(null)
  const [demoCode, setDemoCode] = useState<string | null>(null)
  const [codeOpen, setCodeOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(error)
  const [loading, setLoading] = useState(false)
  const [codeLoading, setCodeLoading] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (codeOpen) codeRef.current?.focus()
  }, [codeOpen])

  const sendLink = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setFormError(null)
    setMessage(null)
    setDemoUrl(null)
    setDemoCode(null)
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
      setCode('')
      setCodeOpen(true)
      if (typeof data.demoUrl === 'string') setDemoUrl(data.demoUrl)
      if (typeof data.demoCode === 'string') {
        setDemoCode(data.demoCode)
        setCode(data.demoCode)
      }
    } catch {
      setFormError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const submitCode = async (event: FormEvent) => {
    event.preventDefault()
    setCodeLoading(true)
    setFormError(null)
    try {
      const response = await fetch('/api/hub/login/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, code }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setFormError(data?.error || 'Something went wrong.')
        return
      }
      window.location.assign('/hub/')
    } catch {
      setFormError('Something went wrong. Try again.')
    } finally {
      setCodeLoading(false)
    }
  }

  const busy = loading || codeLoading

  return (
    <main className="hub-login">
      <p className="hub-wordmark">Prima Hub</p>
      <p className="hub-kicker">Staff</p>
      <h1>Sign in</h1>
      <p className="hub-note">
        Use your staff email. We send a 6-digit code and a one-time link. In the Prima Hub app on your iPhone, enter
        the code here. The link signs in a browser only.
      </p>
      <form onSubmit={sendLink} className="hub-stack" style={{ marginTop: 24 }}>
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
        {message && <p className="hub-note">{message}</p>}
        {demoUrl && (
          <a className="hub-btn hub-btn-block" href={demoUrl}>
            Open demo sign-in link
          </a>
        )}
        <button className="hub-btn hub-btn-block" type="submit" disabled={busy}>
          {loading ? 'Sending…' : 'Email me a link'}
        </button>
      </form>
      {formError && <p className="hub-error" style={{ marginTop: 12 }}>{formError}</p>}
      {codeOpen ? (
        <form onSubmit={submitCode} className="hub-stack" style={{ marginTop: 16 }}>
          {!message && (
            <p className="hub-note">
              Enter the code from the sign-in email and the address it was sent to. This signs in the app. The link in
              the email does not.
            </p>
          )}
          <label className="hub-label" htmlFor="hub-code">
            Sign-in code
            <input
              ref={codeRef}
              id="hub-code"
              className="hub-input hub-code-input"
              name="one-time-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="go"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </label>
          {demoCode && <p className="hub-note">Demo code {demoCode}</p>}
          <button className="hub-btn hub-btn-block" type="submit" disabled={busy || email.trim() === '' || code.length !== 6}>
            {codeLoading ? 'Signing in…' : 'Sign in with code'}
          </button>
        </form>
      ) : (
        <button
          className="hub-btn hub-btn-ghost hub-btn-block"
          type="button"
          style={{ marginTop: 16 }}
          onClick={() => setCodeOpen(true)}
        >
          I already have a code
        </button>
      )}
    </main>
  )
}
