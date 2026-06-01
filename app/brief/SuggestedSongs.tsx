'use client'
import { useEffect, useState } from 'react'

export interface TrackRef {
  id: string
  name: string
  artist: string
  albumArt: string | null
  previewUrl: string | null
  spotifyUrl: string
}

interface SuggestedSongsProps {
  selected: TrackRef[]
  onChange: (tracks: TrackRef[]) => void
}

export default function SuggestedSongs({ selected, onChange }: SuggestedSongsProps) {
  const [tracks, setTracks] = useState<TrackRef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/spotify/playlist-tracks', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setTracks(data.tracks || [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load suggestions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const toggleSelect = (track: TrackRef) => {
    const exists = selected.find((t) => t.id === track.id)
    if (exists) {
      onChange(selected.filter((t) => t.id !== track.id))
    } else {
      onChange([...selected, track])
    }
  }

  // Tracks the user selected in previous shuffles that aren't in the current batch.
  const selectedNotInBatch = selected.filter((s) => !tracks.find((t) => t.id === s.id))

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs text-brand-muted flex-1">
          Press play to preview. Tap &ldquo;Add to brief&rdquo; on any songs that match the vibe
          you want. Reference only &mdash; not necessarily what we&apos;ll use.
        </p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-xs font-medium text-brand-dark hover:underline disabled:opacity-50 whitespace-nowrap"
        >
          {loading ? 'Loading…' : 'Shuffle'}
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(loading && tracks.length === 0
          ? Array.from({ length: 4 }).map(() => null)
          : tracks
        ).map((track, i) => {
          if (!track) {
            return (
              <div
                key={`skel-${i}`}
                className="h-[124px] rounded-xl bg-gray-100 animate-pulse"
              />
            )
          }
          const isSelected = !!selected.find((s) => s.id === track.id)
          return (
            <div
              key={track.id}
              className={`rounded-xl overflow-hidden border transition-all ${
                isSelected
                  ? 'border-brand-dark ring-2 ring-brand-dark/10'
                  : 'border-brand-border'
              }`}
            >
              <iframe
                src={`https://open.spotify.com/embed/track/${track.id}?utm_source=generator`}
                width="100%"
                height="80"
                style={{ border: 0 }}
                loading="lazy"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                title={`${track.name} by ${track.artist}`}
                className="block"
              />
              <button
                type="button"
                onClick={() => toggleSelect(track)}
                className={`w-full px-3 py-2 text-xs font-medium border-t transition-colors ${
                  isSelected
                    ? 'bg-brand-dark text-white border-brand-dark'
                    : 'bg-white text-brand-dark border-brand-border hover:bg-gray-50'
                }`}
              >
                {isSelected ? '✓ Selected' : '+ Add to brief'}
              </button>
            </div>
          )
        })}
      </div>

      {selectedNotInBatch.length > 0 && (
        <div className="pt-2 border-t border-brand-border/50">
          <p className="text-xs text-brand-muted mb-2">Also selected:</p>
          <div className="flex flex-wrap gap-1.5">
            {selectedNotInBatch.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1.5 bg-brand-dark/5 border border-brand-dark/20 rounded-full pl-2.5 pr-1.5 py-1 text-xs"
              >
                <span className="font-medium">{t.name}</span>
                <span className="text-brand-muted">&mdash; {t.artist}</span>
                <button
                  type="button"
                  onClick={() => toggleSelect(t)}
                  className="w-4 h-4 rounded-full text-brand-muted hover:text-brand-dark text-base leading-none"
                  aria-label={`Remove ${t.name}`}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
