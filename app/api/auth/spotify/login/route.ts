import { NextResponse } from 'next/server'

// Kicks off the Spotify Authorization Code flow.
// Visit this URL in a browser, log in to Spotify, click "Allow",
// you'll be redirected to /api/auth/spotify/callback with the auth code.
export const dynamic = 'force-dynamic'

// Scopes for reading the owner's playlists (public, private, collaborative).
const SCOPES = ['playlist-read-private', 'playlist-read-collaborative'].join(' ')

export async function GET(req: Request) {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  if (!clientId) {
    return new NextResponse('SPOTIFY_CLIENT_ID is not configured in env vars', { status: 500 })
  }

  const url = new URL(req.url)
  const redirectUri = `${url.origin}/api/auth/spotify/callback`

  const authUrl = new URL('https://accounts.spotify.com/authorize')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('show_dialog', 'true')

  return NextResponse.redirect(authUrl.toString())
}
