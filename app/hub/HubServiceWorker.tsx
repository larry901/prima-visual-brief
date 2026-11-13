'use client'

import { useEffect } from 'react'

/** Registers a network-only worker so the hub can be installed. It does not cache staff data. */
export default function HubServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/hub/sw.js', { scope: '/hub/' }).catch(() => {
      /* Install still works on iPhone from the manifest and the home-screen meta tags. */
    })
  }, [])
  return null
}
