'use client'
import { useEffect, useRef, useState } from 'react'

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
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

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
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  const togglePreview = (track: TrackRef) => {
    if (!track.previewUrl) return
    if (playingId === track.id) {
      audioRef.current?.pause()
      audioRef.current = null
      setPlayingId(null)
      return
    }
    audioRef.current?.pause()
    const audio = new Audio(track.previewUrl)
    audio.play().catch(() => setPlayingId(null))
    audio.onended = () => {
      setPlayingId(null)
      audioRef.current = null
    }
    audioRef.current = audio
    setPlayingId(track.id)
  }

  const toggleSelect = (track: TrackRef) => {
    const exists = selected.find((t) => t.id === track.id)
    if (exists) {
      onChange(selected.filter((t) => t.id !== track.id))
    } else {
      onChange([...selected, track])
    }
  }

  // Tracks the user selected in earlier shuffles but aren't in the current batch
  const selectedNotInBatch = selected.filter((s) => !tracks.find((t) => t.id === s.id))

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs text-brand-muted flex-1">
          Tap any songs that match the vibe you want. Reference only &mdash; not necessarily
          what we&apos;ll use.
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(loading && tracks.length === 0
          ? Array.from({ length: 4 }).map(() => null)
          : tracks
        ).map((track, i) => {
          if (!track) {
            return <div key={`skel-${i}`} className="h-[60px] rounded-lg bg-gray-100 animate-pulse" />
          }
          const isSelected = !!selected.find((s) => s.id === track.id)
          return (
            <div
              key={track.id}
              role="button"
              tabIndex={0}
              onClick={() => toggleSelect(track)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggleSelect(track)
                }
              }}
              className={`flex items-center gap-3 rounded-lg p-2.5 border transition-colors cursor-pointer select-none ${
                isSelected
                  ? 'bg-brand-dark/5 border-brand-dark'
                  : 'bg-white border-brand-border hover:border-brand-dark/30'
              }`}
            >
              {track.albumArt ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={track.albumArt}
                  alt=""
                  className="w-11 h-11 rounded flex-shrink-0 object-cover"
                />
              ) : (
                <div className="w-11 h-11 bg-gray-200 rounded flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{track.name}</p>
                <p className="text-xs text-brand-muted truncate">{track.artist}</p>
              </div>
              {track.previewUrl && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    togglePreview(track)
                  }}
                  className="w-7 h-7 rounded-full bg-brand-dark text-white flex items-center justify-center text-[10px] flex-shrink-0 hover:bg-brand-dark/80"
                  aria-label={playingId === track.id ? 'Pause preview' : 'Play preview'}
                >
                  {playingId === track.id ? '■' : '▶'}
                </button>
              )}
              <span
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  isSelected ? 'bg-brand-dark border-brand-dark' : 'border-brand-border'
                }`}
                aria-hidden="true"
              >
                {isSelected && (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
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
