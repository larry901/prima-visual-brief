import { timingSafeEqual } from 'crypto'
import type {
  AppointmentPatch,
  AppointmentRecord,
  IngestEventName,
  IngestStore,
  NewAppointment,
} from './types'

export interface IngestEvent {
  event: IngestEventName
  client_email: string
  client_name: string
  appointment_type: string
  start: string
  acuity_appointment_id?: string
  raw_subject?: string
}

export interface IngestResult {
  ok: true
  action: 'created' | 'updated' | 'unchanged'
  appointment_id: number
  needs_review: boolean
  review_reason: string | null
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function authorizeBearer(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false
  const match = header.match(/^Bearer\s+(\S+)\s*$/i)
  if (!match) return false
  const provided = Buffer.from(match[1])
  const expected = Buffer.from(secret)
  if (provided.length !== expected.length) return false
  return timingSafeEqual(provided, expected)
}

export function parseIngestBody(body: unknown): { ok: true; value: IngestEvent } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Expected a JSON object' }
  const record = body as Record<string, unknown>
  const event = record.event
  if (event !== 'new' && event !== 'rescheduled' && event !== 'cancelled') {
    return { ok: false, error: 'event must be new, rescheduled, or cancelled' }
  }
  if (typeof record.client_email !== 'string' || !isEmail(record.client_email)) {
    return { ok: false, error: 'client_email must be an email address' }
  }
  if (typeof record.client_name !== 'string' || !record.client_name.trim()) {
    return { ok: false, error: 'client_name is required' }
  }
  if (typeof record.appointment_type !== 'string' || !record.appointment_type.trim()) {
    return { ok: false, error: 'appointment_type is required' }
  }
  if (typeof record.start !== 'string' || Number.isNaN(new Date(record.start).getTime())) {
    return { ok: false, error: 'start must be an ISO datetime' }
  }
  if (
    record.acuity_appointment_id !== undefined &&
    record.acuity_appointment_id !== null &&
    typeof record.acuity_appointment_id !== 'string'
  ) {
    return { ok: false, error: 'acuity_appointment_id must be a string' }
  }
  if (record.raw_subject !== undefined && record.raw_subject !== null && typeof record.raw_subject !== 'string') {
    return { ok: false, error: 'raw_subject must be a string' }
  }
  return {
    ok: true,
    value: {
      event,
      client_email: record.client_email,
      client_name: record.client_name,
      appointment_type: record.appointment_type,
      start: record.start,
      acuity_appointment_id:
        typeof record.acuity_appointment_id === 'string' ? record.acuity_appointment_id : undefined,
      raw_subject: typeof record.raw_subject === 'string' ? record.raw_subject : undefined,
    },
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function statusFor(event: IngestEventName): 'scheduled' | 'rescheduled' | 'cancelled' {
  if (event === 'new') return 'scheduled'
  if (event === 'rescheduled') return 'rescheduled'
  return 'cancelled'
}

function result(action: IngestResult['action'], row: AppointmentRecord): IngestResult {
  return {
    ok: true,
    action,
    appointment_id: row.id,
    needs_review: row.needsReview,
    review_reason: row.reviewReason,
  }
}

function sameSnapshot(row: AppointmentRecord, next: NewAppointment): boolean {
  return (
    row.clientId === next.clientId &&
    row.appointmentType === next.appointmentType &&
    row.startAt === next.startAt &&
    row.status === next.status &&
    row.clientEmail === next.clientEmail &&
    row.clientName === next.clientName &&
    row.needsReview === next.needsReview &&
    row.reviewReason === next.reviewReason &&
    (row.rawSubject ?? null) === (next.rawSubject ?? null)
  )
}

/**
 * Idempotent upsert for one parsed Acuity notification.
 * Unmatched roster emails are stored and flagged for admin review.
 * Reschedule/cancel without an Acuity id only edits a row when the match is unique.
 */
export async function applyIngestEvent(event: IngestEvent, store: IngestStore): Promise<IngestResult> {
  const email = normalizeEmail(event.client_email)
  const appointmentType = event.appointment_type.trim()
  const startAt = new Date(event.start).toISOString()
  const acuityId = event.acuity_appointment_id?.trim() || null
  const client = await store.findClientByEmail(email)
  const desired = statusFor(event.event)

  const draft: NewAppointment = {
    clientId: client?.id ?? null,
    acuityAppointmentId: acuityId,
    appointmentType,
    startAt,
    status: desired,
    source: 'acuity_email',
    clientEmail: email,
    clientName: event.client_name.trim(),
    rawSubject: event.raw_subject?.trim() || null,
    needsReview: !client,
    reviewReason: client ? null : 'unmatched_client',
  }

  if (acuityId) {
    const existing = await store.findAppointmentByAcuityId(acuityId)
    if (!existing) {
      return result('created', await store.insertAppointment(draft))
    }
    // A repeated "new" must not move a shoot that was already rescheduled or cancelled.
    if (event.event === 'new') {
      const attached = await attachClientIfKnown(store, existing, draft)
      return result(attached.action, attached.row)
    }
    const next = project(existing, draft, desired)
    if (sameSnapshot(existing, next)) return result('unchanged', existing)
    const updated = await store.updateAppointment(existing.id, patchOf(next))
    return result('updated', updated)
  }

  const atSlot = await store.findAppointmentByNaturalKey(email, appointmentType, startAt)

  if (event.event === 'new') {
    if (atSlot) {
      const attached = await attachClientIfKnown(store, atSlot, draft)
      return result(attached.action, attached.row)
    }
    return result('created', await store.insertAppointment(draft))
  }

  if (event.event === 'cancelled') {
    if (atSlot) {
      if (atSlot.status === 'cancelled') return result('unchanged', atSlot)
      return result('updated', await store.updateAppointment(atSlot.id, { status: 'cancelled', rawSubject: draft.rawSubject }))
    }
    const open = await store.listOpenAppointments(email, appointmentType)
    if (open.length === 1) {
      return result('updated', await store.updateAppointment(open[0].id, { status: 'cancelled', rawSubject: draft.rawSubject }))
    }
    const reason = client ? (open.length > 1 ? 'ambiguous_cancel' : 'unknown_appointment') : 'unmatched_client'
    return result(
      'created',
      await store.insertAppointment({
        ...draft,
        status: 'cancelled',
        needsReview: true,
        reviewReason: reason,
      }),
    )
  }

  if (atSlot && atSlot.status !== 'cancelled') {
    if (atSlot.status === 'rescheduled' && atSlot.startAt === startAt && atSlot.appointmentType === appointmentType) {
      return result('unchanged', atSlot)
    }
    return result(
      'updated',
      await store.updateAppointment(atSlot.id, {
        status: 'rescheduled',
        startAt,
        appointmentType,
        clientName: draft.clientName,
        rawSubject: draft.rawSubject,
        needsReview: draft.needsReview,
        reviewReason: draft.reviewReason,
        clientId: draft.clientId,
      }),
    )
  }

  const open = (await store.listOpenAppointments(email, appointmentType)).filter((row) => row.startAt !== startAt)
  if (open.length === 1) {
    return result(
      'updated',
      await store.updateAppointment(open[0].id, {
        status: 'rescheduled',
        startAt,
        appointmentType,
        clientName: draft.clientName,
        rawSubject: draft.rawSubject,
        clientId: draft.clientId ?? open[0].clientId,
        needsReview: draft.needsReview,
        reviewReason: draft.reviewReason,
      }),
    )
  }
  if (open.length === 0) {
    return result('created', await store.insertAppointment(draft))
  }
  return result(
    'created',
    await store.insertAppointment({
      ...draft,
      needsReview: true,
      reviewReason: client ? 'ambiguous_reschedule' : 'unmatched_client',
    }),
  )
}

function project(existing: AppointmentRecord, draft: NewAppointment, status: NewAppointment['status']): NewAppointment {
  return {
    ...draft,
    status,
    source: existing.source,
    acuityAppointmentId: existing.acuityAppointmentId,
  }
}

async function attachClientIfKnown(
  store: IngestStore,
  existing: AppointmentRecord,
  draft: NewAppointment,
): Promise<{ action: 'updated' | 'unchanged'; row: AppointmentRecord }> {
  if (existing.clientId != null || draft.clientId == null) {
    return { action: 'unchanged', row: existing }
  }
  const row = await store.updateAppointment(existing.id, {
    clientId: draft.clientId,
    clientName: draft.clientName,
    needsReview: false,
    reviewReason: null,
  })
  return { action: 'updated', row }
}

function patchOf(next: NewAppointment): AppointmentPatch {
  return {
    clientId: next.clientId,
    appointmentType: next.appointmentType,
    startAt: next.startAt,
    status: next.status,
    clientEmail: next.clientEmail,
    clientName: next.clientName,
    rawSubject: next.rawSubject,
    needsReview: next.needsReview,
    reviewReason: next.reviewReason,
  }
}

export async function handleAcuityIngest(
  request: Request,
  store: IngestStore,
  token: string | undefined,
): Promise<Response> {
  if (!authorizeBearer(request.headers.get('authorization'), token)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = parseIngestBody(body)
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })
  const outcome = await applyIngestEvent(parsed.value, store)
  return Response.json(outcome)
}
