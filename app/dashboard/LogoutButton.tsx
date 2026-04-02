'use client'

export default function LogoutButton() {
  const handleLogout = async () => {
    await fetch('/api/dashboard/logout', { method: 'POST' })
    window.location.href = '/dashboard'
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm text-brand-muted hover:text-brand-dark transition-colors"
    >
      Sign out
    </button>
  )
}
