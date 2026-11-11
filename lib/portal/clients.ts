import { isIsoDate } from './cycle'
import type { ClientInput, ClientKind, FrameLink, PlanSize } from './types'

export function parseClientInput(body: unknown): { ok: true; value: ClientInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Expected a JSON object' }
  const record = body as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : ''
  const company = typeof record.company === 'string' ? record.company.trim() : ''
  const renewalDate = typeof record.renewalDate === 'string' ? record.renewalDate : ''
  const active = record.active !== false && record.active !== 'false'
  if (!name) return { ok: false, error: 'Name is required' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'A valid email is required' }
  const links = parseLinks(record.frameioLinks)
  if (!links.ok) return links
  const kind = parseKind(record.kind)
  if (!kind.ok) return kind
  const schedulingLink = parseSchedulingLink(record.schedulingLink)
  if (!schedulingLink.ok) return schedulingLink
  if (kind.value === 'project') {
    return {
      ok: true,
      value: {
        name,
        email,
        company,
        kind: 'project',
        planSize: null,
        renewalDate: null,
        schedulingLink: schedulingLink.value,
        frameioLinks: links.value,
        active,
      },
    }
  }
  if (record.planSize !== 2 && record.planSize !== 4 && record.planSize !== '2' && record.planSize !== '4') {
    return { ok: false, error: 'Plan size must be 2 or 4' }
  }
  if (!isIsoDate(renewalDate)) return { ok: false, error: 'Renewal date must be YYYY-MM-DD' }
  const planSize = Number(record.planSize) as PlanSize
  return {
    ok: true,
    value: {
      name,
      email,
      company,
      kind: 'subscription',
      planSize,
      renewalDate,
      schedulingLink: schedulingLink.value,
      frameioLinks: links.value,
      active,
    },
  }
}

function parseKind(value: unknown): { ok: true; value: ClientKind } | { ok: false; error: string } {
  if (value === 'subscription' || value === 'project') return { ok: true, value }
  return { ok: false, error: 'Client type must be subscription or per project' }
}

function parseSchedulingLink(value: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false, error: 'Scheduling link must be a URL' }
  const trimmed = value.trim()
  if (!trimmed) return { ok: true, value: null }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false, error: 'Scheduling link must be a full https URL' }
  }
  if (url.protocol !== 'https:') return { ok: false, error: 'Scheduling link must start with https://' }
  return { ok: true, value: trimmed }
}

function parseLinks(value: unknown): { ok: true; value: FrameLink[] } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: [] }
  if (!Array.isArray(value)) return { ok: false, error: 'Frame.io links must be a list' }
  const links: FrameLink[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return { ok: false, error: 'Each Frame.io link needs a label and url' }
    const label = typeof (entry as { label?: unknown }).label === 'string' ? (entry as { label: string }).label.trim() : ''
    const url = typeof (entry as { url?: unknown }).url === 'string' ? (entry as { url: string }).url.trim() : ''
    if (!label && !url) continue
    if (!label || !url) return { ok: false, error: 'Each Frame.io link needs both a label and a url' }
    if (!/^https:\/\//i.test(url)) return { ok: false, error: 'Frame.io links must start with https://' }
    links.push({ label, url })
  }
  return { ok: true, value: links }
}

export function parseCountedTypes(value: unknown): { ok: true; value: string[] } | { ok: false; error: string } {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\r?\n|,/)
      : null
  if (!source) return { ok: false, error: 'Counted types must be a list' }
  const seen = new Set<string>()
  const types: string[] = []
  for (const entry of source) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    types.push(trimmed)
  }
  return { ok: true, value: types }
}
