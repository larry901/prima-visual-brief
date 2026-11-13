'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function SignOutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  return (
    <button
      type="button"
      className="hub-signout"
      disabled={pending}
      onClick={async () => {
        setPending(true)
        await fetch('/api/hub/logout', { method: 'POST' })
        router.push('/hub/login')
        router.refresh()
      }}
    >
      Sign out
    </button>
  )
}
