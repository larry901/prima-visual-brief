/** Public scheduler for per-project clients. Subscription clients never use this. */
export const GENERIC_SCHEDULER = 'https://primavisual.as.me/'

const PREFILL_KEYS = ['firstName', 'lastName', 'email'] as const

export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

/**
 * Add the signed-in client's name and email to a scheduling URL.
 * Package codes and every other existing query parameter stay as they are.
 * Works whether or not the URL already has a `?`.
 */
export function withClientPrefill(schedulingLink: string, name: string, email: string): string {
  const url = new URL(schedulingLink)
  const { firstName, lastName } = splitName(name)
  const prefill: Record<(typeof PREFILL_KEYS)[number], string> = { firstName, lastName, email: email.trim() }
  for (const key of PREFILL_KEYS) {
    const value = prefill[key]
    if (value) url.searchParams.set(key, value)
    else url.searchParams.delete(key)
  }
  return url.toString()
}

/**
 * Subscription clients book only through their own coded link.
 * A missing link does not fall back to the paid public scheduler.
 * Per-project clients always use the public scheduler.
 */
export function bookingUrl(args: {
  kind: 'subscription' | 'project'
  schedulingLink: string | null
  name: string
  email: string
}): string | null {
  if (args.kind === 'project') {
    return withClientPrefill(GENERIC_SCHEDULER, args.name, args.email)
  }
  const link = args.schedulingLink?.trim()
  if (!link) return null
  try {
    return withClientPrefill(link, args.name, args.email)
  } catch {
    return null
  }
}

export function briefFormHref(args: { name: string; email: string; shootDate?: string | null }): string {
  const params = new URLSearchParams()
  if (args.name) params.set('name', args.name)
  if (args.email) params.set('email', args.email)
  if (args.shootDate) params.set('shoot', args.shootDate)
  const query = params.toString()
  return query ? `/brief?${query}` : '/brief'
}
