import { isIsoDate } from './cycle'
import type { ClientInput, FrameLink, PlanSize } from './types'

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
  if (record.planSize !== 2 && record.planSize !== 4 && record.planSize !== '2' && record.planSize !== '4') {
    return { ok: false, error: 'Plan size must be 2 or 4' }
  }
  if (!isIsoDate(renewalDate)) return { ok: false, error: 'Renewal date must be YYYY-MM-DD' }
  const links = parseLinks(record.frameioLinks)
  if (!links.ok) return links
  const planSize = Number(record.planSize) as PlanSize
  return {
    ok: true,
    value: { name, email, company, planSize, renewalDate, frameioLinks: links.value, active },
  }
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
