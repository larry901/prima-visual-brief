import { isDiscoveryAppointmentType } from '../portal/appointment-types'
import { chicagoDate, isIsoDate } from '../portal/cycle'
import { normalizeEmail } from '../portal/email'

export interface DiscoveryLeadEvent {
  event: 'new' | 'rescheduled' | 'cancelled'
  client_email: string
  client_name: string
  appointment_type: string
  start: string
  acuity_appointment_id?: string
  phone?: string
  company?: string
}
import type { HubStore } from './types'
import {
  isLeadSource,
  isLeadStage,
  isOpenStage,
  isServiceType,
  type LeadPatch,
  type LeadRecord,
  type LeadSource,
  type NewLead,
  type ServiceType,
} from './types'

export interface LeadWriteResult {
  leadId: number
  action: 'created' | 'updated' | 'unchanged'
}

export function openLeadByEmail(leads: readonly LeadRecord[], email: string): LeadRecord | null {
  const norm = normalizeEmail(email)
  if (!norm) return null
  const open = leads.filter((lead) => lead.email === norm && isOpenStage(lead.stage))
  open.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id)
  return open[0] ?? null
}

function blank(value: string | null | undefined): boolean {
  return !value || !value.trim()
}

function sameTime(a: string | null, b: string | null): boolean {
  if (a == null || b == null) return a === b
  return new Date(a).getTime() === new Date(b).getTime()
}

function discoveryStatusFor(event: DiscoveryLeadEvent['event']): LeadRecord['discoveryStatus'] {
  if (event === 'new') return 'scheduled'
  if (event === 'rescheduled') return 'rescheduled'
  return 'cancelled'
}

function fill(current: string, incoming: string | undefined): string {
  if (!blank(current) || blank(incoming)) return current
  return incoming!.trim()
}

/**
 * Create or update the open lead for a discovery-call appointment.
 * Matched by email. Won and Lost leads are left alone and a new lead is opened.
 * The original source is kept when the lead already exists, so a referral who
 * later books on Acuity still converts as a referral.
 * Does not change shoot counts. Callers store the appointment separately.
 */
export async function applyDiscoveryLead(
  event: DiscoveryLeadEvent,
  hub: HubStore,
  now: Date = new Date(),
): Promise<LeadWriteResult> {
  if (!isDiscoveryAppointmentType(event.appointment_type)) {
    throw new Error('Not a discovery appointment')
  }
  const email = normalizeEmail(event.client_email)
  const startAt = new Date(event.start).toISOString()
  const status = discoveryStatusFor(event.event)
  const callDay = chicagoDate(new Date(startAt))
  const today = chicagoDate(now)
  const acuityId = event.acuity_appointment_id?.trim() || null
  const leads = await hub.listLeads()
  const existing = openLeadByEmail(leads, email)

  if (!existing) {
    const created = await hub.createLead(
      {
        name: event.client_name.trim(),
        email,
        phone: event.phone?.trim() || '',
        company: event.company?.trim() || '',
        source: 'Acuity discovery call',
        stage: 'Discovery Booked',
        notes: '',
        nextFollowUp: status === 'cancelled' ? today : isIsoDate(callDay) ? callDay : today,
        acuityAppointmentId: acuityId,
        discoveryStartAt: startAt,
        discoveryStatus: status,
      },
      now,
    )
    return { leadId: created.id, action: 'created' }
  }

  const nextFollowUp = nextFollowUpFor(existing, status, callDay, today)
  const patch: LeadPatch = {
    name: fill(existing.name, event.client_name),
    phone: fill(existing.phone, event.phone),
    company: fill(existing.company, event.company),
    acuityAppointmentId: acuityId ?? existing.acuityAppointmentId,
    discoveryStartAt: startAt,
    discoveryStatus: status,
    nextFollowUp,
  }
  if (existing.stage === 'New') patch.stage = 'Discovery Booked'

  if (!discoveryPatchChanges(existing, patch)) {
    return { leadId: existing.id, action: 'unchanged' }
  }
  const updated = await hub.updateLead(existing.id, patch, now)
  return { leadId: updated.id, action: 'updated' }
}

function nextFollowUpFor(
  existing: LeadRecord,
  status: LeadRecord['discoveryStatus'],
  callDay: string,
  today: string,
): string | null {
  if (status === 'cancelled') {
    if (!existing.nextFollowUp || existing.nextFollowUp === callDay) return today
    return existing.nextFollowUp
  }
  if (!existing.nextFollowUp) return isIsoDate(callDay) ? callDay : today
  return existing.nextFollowUp
}

function discoveryPatchChanges(existing: LeadRecord, patch: LeadPatch): boolean {
  if (patch.stage && patch.stage !== existing.stage) return true
  if (patch.name !== undefined && patch.name !== existing.name) return true
  if (patch.phone !== undefined && patch.phone !== existing.phone) return true
  if (patch.company !== undefined && patch.company !== existing.company) return true
  if ((patch.acuityAppointmentId ?? null) !== (existing.acuityAppointmentId ?? null)) return true
  if (!sameTime(patch.discoveryStartAt ?? null, existing.discoveryStartAt)) return true
  if ((patch.discoveryStatus ?? null) !== (existing.discoveryStatus ?? null)) return true
  if ((patch.nextFollowUp ?? null) !== (existing.nextFollowUp ?? null)) return true
  return false
}

export interface WebsiteLeadInput {
  name: string
  email: string
  phone: string
  company: string
  message: string
  serviceType: ServiceType | null
  estimatedValueDollars: number | null
  source: LeadSource
  /** The form's "How did you hear about us?" answer. Empty when omitted. */
  referralSource: string
  /** Set when the answer is a friend or a referral. Source stays Website form. */
  referredBy: string
  /** Submission time for backfills. Null means "now". */
  receivedAt: Date | null
}

const HEARD_ABOUT_PREFIX = 'How they heard about us: '

export function heardAboutLine(referralSource: string): string {
  return `${HEARD_ABOUT_PREFIX}${referralSource.trim()}`
}

/** Friend, referral, or "referred by…" — not a channel name like Google. */
export function isReferralAnswer(value: string): boolean {
  return /\b(friend|referral|referred)\b/i.test(value.trim())
}

function parseReceivedAt(value: unknown): { ok: true; value: Date | null } | { ok: false; error: string } {
  if (value == null || value === '') return { ok: true, value: null }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value.trim())) {
    return { ok: false, error: 'received_at must be an ISO timestamp' }
  }
  const date = new Date(value.trim())
  if (Number.isNaN(date.getTime())) return { ok: false, error: 'received_at must be an ISO timestamp' }
  return { ok: true, value: date }
}

function cleanText(value: unknown, max: number): string | null {
  if (value == null) return ''
  if (typeof value !== 'string') return null
  return value.trim().slice(0, max)
}

export function parseWebsiteLead(body: unknown): { ok: true; value: WebsiteLeadInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Expected a JSON object' }
  const record = body as Record<string, unknown>
  const name = cleanText(record.name, 200)
  if (name == null || !name) return { ok: false, error: 'name is required' }
  const emailRaw = cleanText(record.email, 200)
  if (emailRaw == null || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return { ok: false, error: 'email must be an email address' }
  }
  const phone = cleanText(record.phone, 40)
  if (phone == null) return { ok: false, error: 'phone must be a string' }
  const company = cleanText(record.company, 200)
  if (company == null) return { ok: false, error: 'company must be a string' }
  const message = cleanText(record.message ?? record.notes, 4000)
  if (message == null) return { ok: false, error: 'message must be a string' }
  let serviceType: ServiceType | null = null
  if (record.service_type != null && record.service_type !== '') {
    if (!isServiceType(record.service_type)) {
      return { ok: false, error: 'service_type must be subscription or project' }
    }
    serviceType = record.service_type
  }
  let estimatedValueDollars: number | null = null
  if (record.estimated_value != null && record.estimated_value !== '') {
    const numeric =
      typeof record.estimated_value === 'number'
        ? record.estimated_value
        : typeof record.estimated_value === 'string'
          ? Number(record.estimated_value.replace(/[$,\s]/g, ''))
          : Number.NaN
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1_000_000) {
      return { ok: false, error: 'estimated_value must be a dollar amount' }
    }
    estimatedValueDollars = Math.round(numeric)
  }
  let source: LeadSource = 'Website form'
  if (record.source != null && record.source !== '') {
    if (!isLeadSource(record.source) || record.source !== 'Website form') {
      return { ok: false, error: 'source must be Website form when it is sent' }
    }
    source = record.source
  }
  const referralSource = cleanText(record.referral_source, 200)
  if (referralSource == null) return { ok: false, error: 'referral_source must be a string' }
  const receivedAt = parseReceivedAt(record.received_at)
  if (!receivedAt.ok) return receivedAt
  return {
    ok: true,
    value: {
      name,
      email: normalizeEmail(emailRaw),
      phone,
      company,
      message,
      serviceType,
      estimatedValueDollars,
      source,
      referralSource,
      referredBy: referralSource && isReferralAnswer(referralSource) ? referralSource : '',
      receivedAt: receivedAt.value,
    },
  }
}

function appendNote(notes: string, message: string): string {
  const text = message.trim()
  if (!text || notes.includes(text)) return notes
  return notes ? `${notes}\n${text}` : text
}

function websiteNotes(message: string, referralSource: string): string {
  const heard = referralSource ? heardAboutLine(referralSource) : ''
  return [message.trim(), heard].filter(Boolean).join('\n')
}

/**
 * Create or refresh the open lead for one website-form submission. Matched by email.
 * `receivedAt` is the submission time: a new lead's created time and first follow-up
 * day. A repeat for an open lead keeps the original created time.
 */
export async function applyWebsiteLead(
  input: WebsiteLeadInput,
  hub: HubStore,
  now: Date = new Date(),
): Promise<LeadWriteResult> {
  const occurred = input.receivedAt ?? now
  const followUpDay = chicagoDate(occurred)
  const existing = openLeadByEmail(await hub.listLeads(), input.email)
  if (!existing) {
    const created = await hub.createLead(
      {
        name: input.name,
        email: input.email,
        phone: input.phone,
        company: input.company,
        source: input.source,
        referredBy: input.referredBy,
        stage: 'New',
        serviceType: input.serviceType,
        estimatedValueDollars: input.estimatedValueDollars,
        notes: websiteNotes(input.message, input.referralSource),
        nextFollowUp: followUpDay,
      },
      occurred,
    )
    return { leadId: created.id, action: 'created' }
  }
  let notes = appendNote(existing.notes, input.message)
  if (input.referralSource) notes = appendNote(notes, heardAboutLine(input.referralSource))
  const referredBy = input.referredBy ? fill(existing.referredBy, input.referredBy) : existing.referredBy
  const patch: LeadPatch = {
    name: fill(existing.name, input.name),
    phone: fill(existing.phone, input.phone),
    company: fill(existing.company, input.company),
    referredBy,
    notes,
    serviceType: existing.serviceType ?? input.serviceType,
    estimatedValueDollars: existing.estimatedValueDollars ?? input.estimatedValueDollars,
    nextFollowUp: existing.nextFollowUp ?? followUpDay,
  }
  if (
    patch.name === existing.name &&
    patch.phone === existing.phone &&
    patch.company === existing.company &&
    patch.referredBy === existing.referredBy &&
    patch.notes === existing.notes &&
    patch.serviceType === existing.serviceType &&
    patch.estimatedValueDollars === existing.estimatedValueDollars &&
    patch.nextFollowUp === existing.nextFollowUp
  ) {
    return { leadId: existing.id, action: 'unchanged' }
  }
  const updated = await hub.updateLead(existing.id, patch, now)
  return { leadId: updated.id, action: 'updated' }
}

export function parseManualLead(body: unknown): { ok: true; value: NewLead } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Expected a JSON object' }
  const record = body as Record<string, unknown>
  const name = cleanText(record.name, 200)
  if (name == null || !name) return { ok: false, error: 'name is required' }
  if (!isLeadSource(record.source)) return { ok: false, error: 'source is required' }
  const stage = record.stage == null || record.stage === '' ? 'New' : record.stage
  if (!isLeadStage(stage)) return { ok: false, error: 'stage is not a pipeline stage' }
  const email = cleanText(record.email, 200)
  if (email == null) return { ok: false, error: 'email must be a string' }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'email must be an email address' }
  const phone = cleanText(record.phone, 40)
  if (phone == null) return { ok: false, error: 'phone must be a string' }
  const company = cleanText(record.company, 200)
  if (company == null) return { ok: false, error: 'company must be a string' }
  const referredBy = cleanText(record.referred_by ?? record.referredBy, 200)
  if (referredBy == null) return { ok: false, error: 'referred_by must be a string' }
  const notes = cleanText(record.notes, 4000)
  if (notes == null) return { ok: false, error: 'notes must be a string' }
  const lostReason = cleanText(record.lost_reason ?? record.lostReason, 500)
  if (lostReason == null) return { ok: false, error: 'lost_reason must be a string' }
  if (stage === 'Lost' && !lostReason) return { ok: false, error: 'Add a lost reason' }
  let serviceType: ServiceType | null = null
  if (record.service_type != null && record.service_type !== '') {
    if (!isServiceType(record.service_type)) return { ok: false, error: 'service_type must be subscription or project' }
    serviceType = record.service_type
  }
  let estimatedValueDollars: number | null = null
  if (record.estimated_value != null && record.estimated_value !== '') {
    const numeric =
      typeof record.estimated_value === 'number'
        ? record.estimated_value
        : typeof record.estimated_value === 'string'
          ? Number(String(record.estimated_value).replace(/[$,\s]/g, ''))
          : Number.NaN
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1_000_000) {
      return { ok: false, error: 'estimated_value must be a dollar amount' }
    }
    estimatedValueDollars = Math.round(numeric)
  }
  let nextFollowUp: string | null = null
  if (record.next_follow_up != null && record.next_follow_up !== '') {
    if (typeof record.next_follow_up !== 'string' || !isIsoDate(record.next_follow_up)) {
      return { ok: false, error: 'next_follow_up must be a YYYY-MM-DD date' }
    }
    nextFollowUp = record.next_follow_up
  }
  return {
    ok: true,
    value: {
      name,
      email: email ? normalizeEmail(email) : '',
      phone,
      company,
      source: record.source,
      referredBy,
      stage,
      serviceType,
      estimatedValueDollars,
      notes,
      lostReason,
      nextFollowUp,
    },
  }
}

export function parseLeadPatch(body: unknown): { ok: true; value: LeadPatch & { snooze?: 'tomorrow' | '3days' | 'week' } } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Expected a JSON object' }
  const record = body as Record<string, unknown>
  const patch: LeadPatch & { snooze?: 'tomorrow' | '3days' | 'week' } = {}
  if ('name' in record) {
    const name = cleanText(record.name, 200)
    if (name == null || !name) return { ok: false, error: 'name is required' }
    patch.name = name
  }
  if ('email' in record) {
    const email = cleanText(record.email, 200)
    if (email == null) return { ok: false, error: 'email must be a string' }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'email must be an email address' }
    patch.email = email ? normalizeEmail(email) : ''
  }
  if ('phone' in record) {
    const phone = cleanText(record.phone, 40)
    if (phone == null) return { ok: false, error: 'phone must be a string' }
    patch.phone = phone
  }
  if ('company' in record) {
    const company = cleanText(record.company, 200)
    if (company == null) return { ok: false, error: 'company must be a string' }
    patch.company = company
  }
  if ('source' in record) {
    if (!isLeadSource(record.source)) return { ok: false, error: 'source is not a known source' }
    patch.source = record.source
  }
  if ('referred_by' in record || 'referredBy' in record) {
    const referredBy = cleanText(record.referred_by ?? record.referredBy, 200)
    if (referredBy == null) return { ok: false, error: 'referred_by must be a string' }
    patch.referredBy = referredBy
  }
  if ('stage' in record) {
    if (!isLeadStage(record.stage)) return { ok: false, error: 'stage is not a pipeline stage' }
    patch.stage = record.stage
  }
  if ('lost_reason' in record || 'lostReason' in record) {
    const lostReason = cleanText(record.lost_reason ?? record.lostReason, 500)
    if (lostReason == null) return { ok: false, error: 'lost_reason must be a string' }
    patch.lostReason = lostReason
  }
  if ('notes' in record) {
    const notes = cleanText(record.notes, 4000)
    if (notes == null) return { ok: false, error: 'notes must be a string' }
    patch.notes = notes
  }
  if ('service_type' in record) {
    if (record.service_type == null || record.service_type === '') patch.serviceType = null
    else if (!isServiceType(record.service_type)) return { ok: false, error: 'service_type must be subscription or project' }
    else patch.serviceType = record.service_type
  }
  if ('estimated_value' in record) {
    if (record.estimated_value == null || record.estimated_value === '') patch.estimatedValueDollars = null
    else {
      const numeric =
        typeof record.estimated_value === 'number'
          ? record.estimated_value
          : typeof record.estimated_value === 'string'
            ? Number(record.estimated_value.replace(/[$,\s]/g, ''))
            : Number.NaN
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1_000_000) {
        return { ok: false, error: 'estimated_value must be a dollar amount' }
      }
      patch.estimatedValueDollars = Math.round(numeric)
    }
  }
  if ('next_follow_up' in record) {
    if (record.next_follow_up == null || record.next_follow_up === '') patch.nextFollowUp = null
    else if (typeof record.next_follow_up !== 'string' || !isIsoDate(record.next_follow_up)) {
      return { ok: false, error: 'next_follow_up must be a YYYY-MM-DD date' }
    } else patch.nextFollowUp = record.next_follow_up
  }
  if ('snooze' in record && record.snooze != null) {
    if (record.snooze !== 'tomorrow' && record.snooze !== '3days' && record.snooze !== 'week') {
      return { ok: false, error: 'snooze must be tomorrow, 3days, or week' }
    }
    patch.snooze = record.snooze
  }
  return { ok: true, value: patch }
}
