import { NextRequest, NextResponse } from 'next/server'
import { getTracksForVibes } from '@/lib/spotify'
import { cookies } from 'next/headers'

function isAuthenticated() {
  const cookieStore = cookies()
  return cookieStore.get('prima_session')?.value === 'authenticated'
}

export async function POST(req: NextRequest) {
  if (!isAuthenticated()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { vibes } = await req.json()
    const tracks = await getTracksForVibes(vibes || [])
    return NextResponse.json({ tracks })
  } catch (err: unknown) {
    console.error('Spotify tracks error:', err)
    return NextResponse.json({ tracks: [] })
  }
}
