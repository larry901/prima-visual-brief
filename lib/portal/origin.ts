type HeaderSource = { get(name: string): string | null }

export function originFromHeaders(headerList: HeaderSource): string {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
  if (configured) return configured.replace(/\/$/, '')
  const host = headerList.get('x-forwarded-host') || headerList.get('host') || 'localhost:3000'
  const proto = headerList.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export function requestOrigin(request: Request): string {
  return originFromHeaders(request.headers)
}
