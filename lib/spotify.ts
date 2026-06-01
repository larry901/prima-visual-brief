// ---------------------------------------------------------------------------
// Reference-track source
//
// Reads from a JSON file checked into the repo (data/playlist-tracks.json)
// instead of calling the Spotify Web API at request time. This sidesteps
// Spotify's Development Mode restrictions, which 403 the playlist endpoint
// even with valid user OAuth tokens.
//
// To update the track list: edit data/playlist-tracks.json (id, name, artist
// per entry). The Spotify URL is constructed from the track id. Album art and
// preview audio are intentionally omitted in this offline mode.
// ---------------------------------------------------------------------------

import playlistData from '@/data/playlist-tracks.json'

export interface SpotifyTrack {
  id: string
  name: string
  artist: string
  albumArt: string | null
  previewUrl: string | null
  spotifyUrl: string
}

interface RawTrack {
  id: string
  name: string
  artist: string
}

const ALL_TRACKS: SpotifyTrack[] = (playlistData as RawTrack[]).map((t) => ({
  id: t.id,
  name: t.name,
  artist: t.artist,
  albumArt: null,
  previewUrl: null,
  spotifyUrl: `https://open.spotify.com/track/${t.id}`,
}))

/** Returns `count` randomly-selected tracks from the curated playlist file. */
export async function getRandomPlaylistTracks(count = 4): Promise<SpotifyTrack[]> {
  const pool = [...ALL_TRACKS]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}
