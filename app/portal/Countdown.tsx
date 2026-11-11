'use client'

import { useEffect, useState } from 'react'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export default function Countdown({ targetIso }: { targetIso: string }) {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  const diff = now === null ? null : Math.max(0, new Date(targetIso).getTime() - now)
  const total = diff === null ? 0 : Math.floor(diff / 1000)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60

  return (
    <p className="portal-countdown" role="timer" aria-live="off">
      {diff === null ? (
        <span className="portal-countdown-placeholder">Loading countdown</span>
      ) : (
        <>
          <span>{pad(days)}<small>d</small></span>
          <span>{pad(hours)}<small>h</small></span>
          <span>{pad(minutes)}<small>m</small></span>
          <span>{pad(seconds)}<small>s</small></span>
        </>
      )}
    </p>
  )
}
