'use client'

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

// Renders the tracks a client selected on their brief using Spotify's public
// embed iframe — gives Larry album art + 30s preview + a click-through to
// the full song in Spotify, with no API auth required.
export default function TrackList({ tracks }: TrackListProps) {
  if (tracks.length === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {tracks.map((track) => (
        <div
          key={track.id}
          className="rounded-xl overflow-hidden border border-brand-border"
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
        </div>
      ))}
    </div>
  )
}
