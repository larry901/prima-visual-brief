let accessToken: string | null = null
let tokenExpiry: number = 0

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

  if (!clientId || !clientSecret) throw new Error('Spotify credentials not configured')

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) throw new Error('Failed to get Spotify token')

  const data = await res.json()
  accessToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return accessToken!
}

const VIBE_QUERIES: Record<string, string> = {
  'Cinematic / Orchestral': 'cinematic orchestral real estate luxury',
  'Modern Luxury': 'modern luxury ambient electronic',
  'Chill / Lo-fi': 'lofi chill beats relaxing',
  'Upbeat / Energetic': 'upbeat energetic indie pop',
  'Acoustic / Warm': 'acoustic warm folk guitar',
  'R&B / Soul': 'rnb soul smooth',
  'No Music': '',
}

export interface SpotifyTrack {
  id: string
  name: string
  artist: string
  albumArt: string | null
  previewUrl: string | null
  spotifyUrl: string
}

export async function getTracksForVibes(vibes: string[]): Promise<SpotifyTrack[]> {
  const filteredVibes = vibes.filter((v) => v !== 'No Music')
  if (filteredVibes.length === 0) return []

  const token = await getAccessToken()
  const query = filteredVibes
    .map((v) => VIBE_QUERIES[v] || v)
    .filter(Boolean)
    .join(' ')

  const searchQuery = encodeURIComponent(query)
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${searchQuery}&type=track&limit=5&market=US`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!res.ok) return []

  const data = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tracks = data.tracks?.items || []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tracks.map((track: any) => ({
    id: track.id,
    name: track.name,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    artist: track.artists.map((a: any) => a.name).join(', '),
    albumArt: track.album?.images?.[0]?.url || null,
    previewUrl: track.preview_url || null,
    spotifyUrl: track.external_urls?.spotify || '',
  }))
}
