'use client'

import { useEffect, useRef, useState } from 'react'
import type { ScriptPhoto } from '@/lib/script-photos'

export default function ScriptPhotoGallery({
  photos,
  onRemove,
  hideLabel = false,
}: {
  photos: ScriptPhoto[]
  onRemove?: (photo: ScriptPhoto) => void
  hideLabel?: boolean
}) {
  const [active, setActive] = useState<ScriptPhoto | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActive(null)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      openerRef.current?.focus()
    }
  }, [active])

  if (photos.length === 0) return null

  return (
    <div className="mt-3">
      {hideLabel ? null : <p className="text-xs font-medium mb-2">Reference photos</p>}
      <ul className="flex flex-wrap gap-3 list-none m-0 p-0">
        {photos.map((photo) => (
          <li key={photo.url} className="flex items-start gap-1">
            <button
              type="button"
              className="block h-24 w-24 overflow-hidden rounded-lg border border-current/25 bg-black/5 p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              aria-label={`View ${photo.name} full size`}
              onClick={(event) => {
                openerRef.current = event.currentTarget
                setActive(photo)
              }}
            >
              {/* Blob hosts are per store, so next/image remote patterns cannot list them ahead of time. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="h-full w-full object-cover" />
            </button>
            {onRemove ? (
              <button
                type="button"
                className="min-h-11 min-w-11 rounded-lg border border-current/25 text-lg leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                aria-label={`Remove ${photo.name}`}
                onClick={() => onRemove(photo)}
              >
                &times;
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {active ? (
        <div
          className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={active.name}
          onClick={() => setActive(null)}
        >
          <div className="relative max-h-[90vh] max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <button
              ref={closeRef}
              type="button"
              className="absolute top-2 right-2 min-h-11 px-3 rounded-lg bg-white text-brand-dark text-sm font-medium"
              onClick={() => setActive(null)}
            >
              Close
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={active.url} alt={active.name} className="max-h-[90vh] max-w-full rounded-lg object-contain" />
          </div>
        </div>
      ) : null}
    </div>
  )
}
