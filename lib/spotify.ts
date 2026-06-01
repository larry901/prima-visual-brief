// ---------------------------------------------------------------------------
// Spotify integration
//
// Auth: Client Credentials flow (server-to-server, no user login required).
// Source: a single curated playlist whose ID is set via SPOTIFY_PLAYLIST_ID.
// Public API: getRandomPlaylistTracks(count) — returns N random tracks.
// ---------------------------------------------------------------------------

export interface SpotifyTrack {
  id: string
  name: string
  artist: string
  albumArt: string | null
  previewUrl: string | null
  spotifyUrl: string
}

// Module-level caches. Persist for the lifetime of a serverless function
// instance (warm starts); reset on cold start. Safe and cheap.
let accessToken: string | null = null
let tokenExpiry = 0

const PLAYLIST_CACHE_TTL_MS = 5 * 60 * 1000
let playlistCache: { tracks: SpotifyTrack[]; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not configured')
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Spotify token request failed: ${res.status}`)

  const data = await res.json()
  accessToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return accessToken!
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeTrack(t: any): SpotifyTrack | null {
  if (!t || !t.id) return null
  return {
    id: t.id,
    name: t.name,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    artist: (t.artists || []).map((a: any) => a.name).join(', '),
    albumArt: t.album?.images?.[0]?.url || null,
    previewUrl: t.preview_url || null,
    spotifyUrl: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
  }
}

async function fetchAllPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
  const token = await getAccessToken()
  const tracks: SpotifyTrack[] = []

  let url: string | null =
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks` +
    `?market=US&limit=100` +
    `&fields=next,items(track(id,name,preview_url,external_urls,artists(name),album(images)))`

  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Spotify playlist fetch failed: ${res.status}`)
    const data = await res.json()

    for (const item of data.items || []) {
      const track = normalizeTrack(item?.track)
      if (track) tracks.push(track)
    }
    url = data.next || null
  }

  return tracks
}

/**
 * Returns `count` randomly-selected tracks from the configured Spotify playlist.
 * Playlist contents are cached in-memory for 5 minutes.
 */
export async function getRandomPlaylistTracks(count = 4): Promise<SpotifyTrack[]> {
  const playlistId = process.env.SPOTIFY_PLAYLIST_ID
  if (!playlistId) throw new Error('SPOTIFY_PLAYLIST_ID is not set')

  if (!playlistCache || Date.now() > playlistCache.expiresAt) {
    const tracks = await fetchAllPlaylistTracks(playlistId)
    playlistCache = { tracks, expiresAt: Date.now() + PLAYLIST_CACHE_TTL_MS }
  }

  // Fisher–Yates shuffle a copy, then slice.
  const pool = [...playlistCache.tracks]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}
