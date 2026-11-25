// ---------------------------------------------------------------------------
// Reference-track source
//
// The brief form suggests 4 random tracks from data/playlist-tracks.json
// (id, name, artist). Album art and preview audio are omitted; the form
// embeds each suggestion by track id. The Spotify URL is built from that id.
//
// The file is a snapshot of Larry's public playlist:
// https://open.spotify.com/playlist/6tk5vOlKor3dioJJPXAhBj
// Refresh it (id defaults to that playlist, or pass an id / playlist URL):
//
//   npm run refresh:playlist
//
// Checked 2026-11-24. The public embed page returns the tracks with no
// developer credentials: https://open.spotify.com/embed/playlist/<id>
// server-renders them in __NEXT_DATA__ (uri, title, subtitle, isPlayable),
// and the rendered row count matches that list. open.spotify.com's anonymous
// token endpoint is rejected, and api.spotify.com with the embed session
// token returns 429 QUOTA_EXCEEDED. Client-credentials and user-token
// playlist reads were already 403 in Development Mode when the live API was
// removed on 2026-06-01; this refresh does not use them.
//
// The script keeps playlist order, dedupes by id, and skips local files plus
// tracks the embed marks unplayable. That flag follows the machine's country
// (the old sync passed market=US).
//
// .github/workflows/refresh-playlist.yml can open a PR when the snapshot
// changes. The Monday schedule does nothing until the repository variable
// PLAYLIST_REFRESH is exactly "true". workflow_dispatch runs it on demand.
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
