'use client'

export default function SignOutButton() {
  return (
    <button
      type="button"
      className="portal-text-btn"
      onClick={async () => {
        await fetch('/api/portal/logout', { method: 'POST' })
        window.location.href = '/portal'
      }}
    >
      Sign out
    </button>
  )
}
