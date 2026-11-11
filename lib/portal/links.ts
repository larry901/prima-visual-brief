const ACUITY_SCHEDULER = 'https://primavisual.as.me/'

export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

/** Acuity Standard has no API. Prefill uses the public scheduler query string. */
export function acuitySchedulerUrl(name: string, email: string): string {
  const { firstName, lastName } = splitName(name)
  const url = new URL(ACUITY_SCHEDULER)
  if (firstName) url.searchParams.set('firstName', firstName)
  if (lastName) url.searchParams.set('lastName', lastName)
  if (email) url.searchParams.set('email', email)
  return url.toString()
}

export function briefFormHref(args: { name: string; email: string; shootDate?: string | null }): string {
  const params = new URLSearchParams()
  if (args.name) params.set('name', args.name)
  if (args.email) params.set('email', args.email)
  if (args.shootDate) params.set('shoot', args.shootDate)
  const query = params.toString()
  return query ? `/brief?${query}` : '/brief'
}
