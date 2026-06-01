import { NextResponse } from 'next/server'
import { getRandomPlaylistTracks } from '@/lib/spotify'

// Public endpoint — clients fill the brief without authentication.
// Returns 4 random tracks from the curated playlist file on every call.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const tracks = await getRandomPlaylistTracks(4)
    return NextResponse.json({ tracks })
  } catch (err) {
    console.error('Playlist tracks fetch failed:', err)
    return NextResponse.json(
      { tracks: [], error: 'Failed to load track suggestions' },
      { status: 500 }
    )
  }
}
