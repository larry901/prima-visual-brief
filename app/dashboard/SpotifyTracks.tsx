'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'

interface Track {
  id: string
  name: string
  artist: string
  albumArt: string | null
  previewUrl: string | null
  spotifyUrl: string
}

interface SpotifyTracksProps {
  vibes: string[]
}

export default function SpotifyTracks({ vibes }: SpotifyTracksProps) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState<string | null>(null)
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null)

  useEffect(() => {
    const effectiveVibes = vibes.filter((v) => v !== 'No Music')
    if (effectiveVibes.length === 0) {
      setLoading(false)
      return
    }

    fetch('/api/spotify/tracks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vibes: effectiveVibes }),
    })
      .then((r) => r.json())
      .then((data) => setTracks(data.tracks || []))
      .catch(() => setTracks([]))
      .finally(() => setLoading(false))
  }, [vibes])

  const togglePreview = (track: Track) => {
    if (!track.previewUrl) return

    if (playing === track.id) {
      audio?.pause()
      setPlaying(null)
      setAudio(null)
    } else {
      audio?.pause()
      const newAudio = new Audio(track.previewUrl)
      newAudio.play()
      newAudio.onended = () => {
        setPlaying(null)
        setAudio(null)
      }
      setAudio(newAudio)
      setPlaying(track.id)
    }
  }

  const noMusic = vibes.includes('No Music') && vibes.length === 1

  if (noMusic) {
    return <p className="text-sm text-brand-muted italic">No music requested for this section.</p>
  }

  if (loading) {
    return <div className="text-sm text-brand-muted">Loading suggested tracks&hellip;</div>
  }

  if (tracks.length === 0) {
    return <p className="text-sm text-brand-muted">No track suggestions available.</p>
  }

  return (
    <div>
      <p className="text-xs text-brand-muted italic mb-3">Suggested tracks &mdash; reference only</p>
      <div className="space-y-2">
        {tracks.map((track) => (
          <div key={track.id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
            {track.albumArt ? (
              <Image
                src={track.albumArt}
                alt={track.name}
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
                  onClick={() => togglePreview(track)}
                  className="w-8 h-8 rounded-full bg-brand-dark text-white flex items-center justify-center text-xs hover:bg-brand-dark/80 transition-colors"
                >
                  {playing === track.id ? '\u25A0' : '\u25B6'}
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
    </div>
  )
}
