import { NextResponse } from 'next/server'
import { getRandomPlaylistTracks } from '@/lib/spotify'

// Public endpoint — clients fill the brief without authentication.
// Returns 4 random tracks from the configured Spotify playlist on every call.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const tracks = await getRandomPlaylistTracks(4)
    return NextResponse.json({ tracks })
  } catch (err) {
    console.error('Playlist tracks fetch failed:', err)
    const detail = err instanceof Error ? err.message : String(err)
    const playlistIdSet = !!process.env.SPOTIFY_PLAYLIST_ID
    const clientIdSet = !!process.env.SPOTIFY_CLIENT_ID
    const clientSecretSet = !!process.env.SPOTIFY_CLIENT_SECRET
    return NextResponse.json(
      {
        tracks: [],
        error: 'Failed to load track suggestions',
        detail,
        envCheck: { playlistIdSet, clientIdSet, clientSecretSet },
      },
      { status: 500 }
    )
  }
}
