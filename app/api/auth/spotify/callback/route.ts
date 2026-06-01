import { NextResponse } from 'next/server'

// Receives the Spotify OAuth callback, exchanges the code for a refresh token,
// and renders a one-time HTML page that shows the refresh token plus copy-friendly
// instructions for adding it to Vercel.
export const dynamic = 'force-dynamic'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function htmlPage(title: string, bodyInner: string, status = 200): NextResponse {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; color: #1A1A1A; line-height: 1.5; }
  h1 { font-size: 24px; margin-bottom: 8px; }
  h2 { font-size: 16px; margin-top: 28px; }
  pre { background: #f3f4f6; padding: 16px; border-radius: 8px; overflow-x: auto; word-break: break-all; white-space: pre-wrap; font-size: 13px; cursor: pointer; user-select: all; }
  ol li { margin: 10px 0; }
  code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  .ok { background: #DCFCE7; color: #166534; padding: 12px 16px; border-radius: 8px; display: inline-block; margin-bottom: 24px; font-weight: 500; }
  .err { background: #FEE2E2; color: #991B1B; padding: 12px 16px; border-radius: 8px; display: inline-block; margin-bottom: 24px; font-weight: 500; }
  a { color: #1A1A1A; }
</style></head><body>${bodyInner}</body></html>`

  return new NextResponse(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
  })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const errorParam = url.searchParams.get('error')

  if (errorParam) {
    return htmlPage(
      'Spotify auth error',
      `<div class="err">Spotify returned an error: ${escapeHtml(errorParam)}</div>
       <p>This usually means you clicked "Cancel" on the Spotify authorization screen. <a href="/api/auth/spotify/login">Try again</a>.</p>`,
      400
    )
  }

  if (!code) {
    return htmlPage(
      'Missing code',
      `<div class="err">No authorization code in the URL.</div>
       <p>Start the flow at <a href="/api/auth/spotify/login">/api/auth/spotify/login</a>.</p>`,
      400
    )
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return htmlPage(
      'Server misconfigured',
      `<div class="err">SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are not configured in Vercel env vars.</div>`,
      500
    )
  }

  const redirectUri = `${url.origin}/api/auth/spotify/callback`

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: params.toString(),
    cache: 'no-store',
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '')
    return htmlPage(
      'Token exchange failed',
      `<div class="err">Spotify rejected the code exchange (${tokenRes.status}).</div>
       <p>Common causes:</p>
       <ul>
         <li>The redirect URI registered in your Spotify app doesn&rsquo;t match exactly. It must be: <code>${escapeHtml(redirectUri)}</code></li>
         <li>The Client Secret in Vercel doesn&rsquo;t match the one in your Spotify app.</li>
       </ul>
       <p>Spotify said: <code>${escapeHtml(text)}</code></p>`,
      500
    )
  }

  const data = await tokenRes.json()
  const refreshToken = data.refresh_token as string | undefined

  if (!refreshToken) {
    return htmlPage(
      'No refresh token',
      `<div class="err">Spotify didn&rsquo;t return a refresh token. This is unusual.</div>
       <p>Try the flow again at <a href="/api/auth/spotify/login">/api/auth/spotify/login</a>.</p>`,
      500
    )
  }

  // Success — render the refresh token + next-step instructions.
  return htmlPage(
    'Spotify auth done',
    `
    <div class="ok">&check; Spotify authorization successful</div>
    <h1>Your refresh token</h1>
    <p>Copy the value below (the whole string) and add it to Vercel as an environment variable named <code>SPOTIFY_REFRESH_TOKEN</code>.</p>
    <pre id="token">${escapeHtml(refreshToken)}</pre>
    <p style="font-size: 13px; color: #6B7280;">Tip: click the box above to select all, then Cmd&plus;C to copy.</p>
    <h2>Next steps</h2>
    <ol>
      <li>Go to <a href="https://vercel.com/larry-7485s-projects/prima-visual-brief/settings/environment-variables" target="_blank" rel="noopener">Vercel &rarr; Settings &rarr; Environment Variables</a></li>
      <li>Click <strong>Create new</strong> (or the &ldquo;+&rdquo; button)</li>
      <li>Key: <code>SPOTIFY_REFRESH_TOKEN</code></li>
      <li>Value: paste the refresh token from the box above</li>
      <li>Mark it <strong>Sensitive</strong>. Check <strong>Production</strong> (Preview optional). Click <strong>Save</strong>.</li>
      <li>Go to <strong>Deployments</strong> &rarr; click the <code>&hellip;</code> menu on the top entry &rarr; <strong>Redeploy</strong>. <em>Uncheck</em> &ldquo;Use existing Build Cache&rdquo;. Confirm.</li>
      <li>Wait ~60 seconds for the new deploy to finish.</li>
      <li>Visit <a href="/api/spotify/playlist-tracks">/api/spotify/playlist-tracks</a> &mdash; you should now see a JSON blob of actual tracks.</li>
      <li>Visit <a href="/brief">/brief</a> and confirm the Reference songs section populates.</li>
    </ol>
    `
  )
}
