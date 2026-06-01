'use client'
import { useRef, useState } from 'react'
import Image from 'next/image'

export interface TrackRef {
  id: string
  name: string
  artist: string
  albumArt: string | null
  previewUrl: string | null
  spotifyUrl: string
}

interface TrackListProps {
  tracks: TrackRef[]
}

export default function TrackList({ tracks }: TrackListProps) {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

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

  if (tracks.length === 0) return null

  return (
    <div className="space-y-2">
      {tracks.map((track) => (
        <div key={track.id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
          {track.albumArt ? (
            <Image
              src={track.albumArt}
              alt=""
              width={44}
              height={44}
              className="rounded-lg flex-shrink-0 object-cover"
            />
          ) : (
            <div className="w-11 h-11 bg-gray-200 rounded-lg flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{track.name}</p>
            <p className="text-xs text-brand-muted truncate">{track.artist}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {track.previewUrl && (
              <button
                type="button"
                onClick={() => togglePreview(track)}
                className="w-8 h-8 rounded-full bg-brand-dark text-white flex items-center justify-center text-xs hover:bg-brand-dark/80 transition-colors"
                aria-label={playingId === track.id ? 'Pause preview' : 'Play preview'}
              >
                {playingId === track.id ? '■' : '▶'}
              </button>
            )}
            <a
              href={track.spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-brand-muted hover:text-brand-dark underline"
            >
              Open
            </a>
          </div>
        </div>
      ))}
    </div>
  )
}
