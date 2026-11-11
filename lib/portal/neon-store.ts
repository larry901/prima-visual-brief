import { neon } from '@neondatabase/serverless'
import { DEFAULT_COUNTED_TYPES } from './cycle'
import { normalizeEmail } from './ingest'
import type {
  AppointmentPatch,
  AppointmentRecord,
  AppointmentStatus,
  ClientInput,
  ClientRecord,
  FrameLink,
  NewAppointment,
  PlanSize,
  PortalStore,
} from './types'

function sqlClient() {
  const url = process.env.POSTGRES_URL
  if (!url) throw new Error('POSTGRES_URL environment variable is not set')
  return neon(url)
}

function asDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString()
}

function asBool(value: unknown): boolean {
  return value === true || value === 't' || value === 'true' || value === 1
}

function asPlan(value: unknown): PlanSize {
  return Number(value) === 4 ? 4 : 2
}

function parseLinks(value: unknown): FrameLink[] {
  try {
    const raw = typeof value === 'string' ? JSON.parse(value) : value
    if (!Array.isArray(raw)) return []
    return raw.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const label = typeof (entry as { label?: unknown }).label === 'string' ? (entry as { label: string }).label : ''
      const url = typeof (entry as { url?: unknown }).url === 'string' ? (entry as { url: string }).url : ''
      if (!label || !url) return []
      return [{ label, url }]
    })
  } catch {
    return []
  }
}

interface ClientRow {
  id: number
  name: string
  email: string
  company: string | null
  plan_size: number
  renewal_date: string | Date
  billing_anchor_day: number
  frameio_links: string
  active: boolean
}

interface AppointmentRow {
  id: number
  client_id: number | null
  acuity_appointment_id: string | null
  appointment_type: string
  start_at: string | Date
  status: AppointmentStatus
  source: string
  client_email: string
  client_name: string
  raw_subject: string | null
  needs_review: boolean
  review_reason: string | null
}

function mapClient(row: ClientRow): ClientRecord {
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    company: row.company ?? '',
    planSize: asPlan(row.plan_size),
    renewalDate: asDate(row.renewal_date),
    billingAnchorDay: Number(row.billing_anchor_day),
    frameioLinks: parseLinks(row.frameio_links),
    active: asBool(row.active),
  }
}

function mapAppointment(row: AppointmentRow): AppointmentRecord {
  return {
    id: Number(row.id),
    clientId: row.client_id == null ? null : Number(row.client_id),
    acuityAppointmentId: row.acuity_appointment_id,
    appointmentType: row.appointment_type,
    startAt: asIso(row.start_at),
    status: row.status,
    source: row.source,
    clientEmail: row.client_email,
    clientName: row.client_name,
    rawSubject: row.raw_subject,
    needsReview: asBool(row.needs_review),
    reviewReason: row.review_reason,
  }
}

function duplicateEmail(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /duplicate key|unique constraint/i.test(message) && /email/i.test(message)
}

export function createNeonStore(): PortalStore {
  let ready: Promise<void> | null = null

  async function ensureReady(): Promise<void> {
    if (!ready) {
      ready = migrate().catch((error) => {
        ready = null
        throw error
      })
    }
    return ready
  }

  async function migrate(): Promise<void> {
    const sql = sqlClient()
    await sql`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        company TEXT NOT NULL DEFAULT '',
        plan_size INTEGER NOT NULL CHECK (plan_size IN (2, 4)),
        renewal_date DATE NOT NULL,
        billing_anchor_day INTEGER NOT NULL CHECK (billing_anchor_day BETWEEN 1 AND 31),
        frameio_links TEXT NOT NULL DEFAULT '[]',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
        acuity_appointment_id TEXT UNIQUE,
        appointment_type TEXT NOT NULL,
        start_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('scheduled', 'rescheduled', 'cancelled')),
        source TEXT NOT NULL DEFAULT 'acuity_email',
        client_email TEXT NOT NULL,
        client_name TEXT NOT NULL DEFAULT '',
        raw_subject TEXT,
        needs_review BOOLEAN NOT NULL DEFAULT FALSE,
        review_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS appointments_client_id_idx ON appointments (client_id)`
    await sql`CREATE INDEX IF NOT EXISTS appointments_email_idx ON appointments (lower(client_email))`
    await sql`
      CREATE TABLE IF NOT EXISTS magic_links (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`
      CREATE TABLE IF NOT EXISTS portal_sessions (
        token_hash TEXT PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`
      CREATE TABLE IF NOT EXISTS portal_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `
    await sql`
      INSERT INTO portal_settings (key, value)
      VALUES ('counted_appointment_types', ${JSON.stringify(DEFAULT_COUNTED_TYPES)})
      ON CONFLICT (key) DO NOTHING
    `
  }

  async function clientById(id: number): Promise<ClientRecord | null> {
    const sql = sqlClient()
    const rows = await sql`SELECT * FROM clients WHERE id = ${id} LIMIT 1`
    return rows[0] ? mapClient(rows[0] as ClientRow) : null
  }

  return {
    ensureReady,

    async listClients() {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`SELECT * FROM clients ORDER BY lower(name) ASC`
      return (rows as ClientRow[]).map(mapClient)
    },

    async getClient(id) {
      await ensureReady()
      return clientById(id)
    },

    async findClientByEmail(email) {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`SELECT * FROM clients WHERE email = ${normalizeEmail(email)} LIMIT 1`
      return rows[0] ? mapClient(rows[0] as ClientRow) : null
    },

    async createClient(input: ClientInput) {
      await ensureReady()
      const sql = sqlClient()
      const anchor = Number(input.renewalDate.slice(8, 10))
      try {
        const rows = await sql`
          INSERT INTO clients (
            name, email, company, plan_size, renewal_date, billing_anchor_day, frameio_links, active
          ) VALUES (
            ${input.name},
            ${normalizeEmail(input.email)},
            ${input.company},
            ${input.planSize},
            ${input.renewalDate},
            ${anchor},
            ${JSON.stringify(input.frameioLinks)},
            ${input.active}
          )
          RETURNING *
        `
        return mapClient(rows[0] as ClientRow)
      } catch (error) {
        if (duplicateEmail(error)) throw new Error('A client with that email already exists')
        throw error
      }
    },

    async updateClient(id, input) {
      await ensureReady()
      const sql = sqlClient()
      const existing = await clientById(id)
      if (!existing) throw new Error('Client not found')
      const anchor =
        existing.renewalDate === input.renewalDate
          ? existing.billingAnchorDay
          : Number(input.renewalDate.slice(8, 10))
      try {
        const rows = await sql`
          UPDATE clients SET
            name = ${input.name},
            email = ${normalizeEmail(input.email)},
            company = ${input.company},
            plan_size = ${input.planSize},
            renewal_date = ${input.renewalDate},
            billing_anchor_day = ${anchor},
            frameio_links = ${JSON.stringify(input.frameioLinks)},
            active = ${input.active},
            updated_at = NOW()
          WHERE id = ${id}
          RETURNING *
        `
        if (!rows[0]) throw new Error('Client not found')
        return mapClient(rows[0] as ClientRow)
      } catch (error) {
        if (duplicateEmail(error)) throw new Error('A client with that email already exists')
        throw error
      }
    },

    async updateRenewal(id, renewalDate) {
      await ensureReady()
      const sql = sqlClient()
      await sql`
        UPDATE clients SET renewal_date = ${renewalDate}, updated_at = NOW() WHERE id = ${id}
      `
    },

    async findAppointmentByAcuityId(acuityId) {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`
        SELECT * FROM appointments WHERE acuity_appointment_id = ${acuityId} LIMIT 1
      `
      return rows[0] ? mapAppointment(rows[0] as AppointmentRow) : null
    },

    async findAppointmentByNaturalKey(email, appointmentType, startAt) {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`
        SELECT * FROM appointments
        WHERE lower(client_email) = ${normalizeEmail(email)}
          AND lower(appointment_type) = ${appointmentType.trim().toLowerCase()}
          AND start_at = CAST(${startAt} AS timestamptz)
        LIMIT 1
      `
      return rows[0] ? mapAppointment(rows[0] as AppointmentRow) : null
    },

    async listOpenAppointments(email, appointmentType) {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`
        SELECT * FROM appointments
        WHERE lower(client_email) = ${normalizeEmail(email)}
          AND lower(appointment_type) = ${appointmentType.trim().toLowerCase()}
          AND needs_review = FALSE
          AND status IN ('scheduled', 'rescheduled')
        ORDER BY start_at ASC
      `
      return (rows as AppointmentRow[]).map(mapAppointment)
    },

    async insertAppointment(row: NewAppointment) {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`
        INSERT INTO appointments (
          client_id, acuity_appointment_id, appointment_type, start_at, status, source,
          client_email, client_name, raw_subject, needs_review, review_reason
        ) VALUES (
          ${row.clientId},
          ${row.acuityAppointmentId},
          ${row.appointmentType},
          CAST(${row.startAt} AS timestamptz),
          ${row.status},
          ${row.source},
          ${row.clientEmail},
          ${row.clientName},
          ${row.rawSubject},
          ${row.needsReview},
          ${row.reviewReason}
        )
        RETURNING *
      `
      return mapAppointment(rows[0] as AppointmentRow)
    },

    async updateAppointment(id, patch: AppointmentPatch) {
      await ensureReady()
      const sql = sqlClient()
      const currentRows = await sql`SELECT * FROM appointments WHERE id = ${id} LIMIT 1`
      if (!currentRows[0]) throw new Error('Appointment not found')
      const current = mapAppointment(currentRows[0] as AppointmentRow)
      const next: AppointmentRecord = { ...current, ...patch }
      const rows = await sql`
        UPDATE appointments SET
          client_id = ${next.clientId},
          appointment_type = ${next.appointmentType},
          start_at = CAST(${next.startAt} AS timestamptz),
          status = ${next.status},
          client_email = ${next.clientEmail},
          client_name = ${next.clientName},
          raw_subject = ${next.rawSubject},
          needs_review = ${next.needsReview},
          review_reason = ${next.reviewReason},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `
      return mapAppointment(rows[0] as AppointmentRow)
    },

    async listAppointmentsForClient(clientId) {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`
        SELECT * FROM appointments WHERE client_id = ${clientId} ORDER BY start_at ASC
      `
      return (rows as AppointmentRow[]).map(mapAppointment)
    },

    async listNeedsReview() {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`
        SELECT * FROM appointments WHERE needs_review = TRUE ORDER BY created_at DESC, id DESC
      `
      return (rows as AppointmentRow[]).map(mapAppointment)
    },

    async dismissReview(id) {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`
        DELETE FROM appointments WHERE id = ${id} AND needs_review = TRUE RETURNING id
      `
      return rows.length > 0
    },

    async attachUnmatched(email, clientId) {
      await ensureReady()
      const sql = sqlClient()
      await sql`
        UPDATE appointments SET
          client_id = ${clientId},
          needs_review = CASE WHEN review_reason = 'unmatched_client' THEN FALSE ELSE needs_review END,
          review_reason = CASE WHEN review_reason = 'unmatched_client' THEN NULL ELSE review_reason END,
          updated_at = NOW()
        WHERE lower(client_email) = ${normalizeEmail(email)}
          AND (client_id IS NULL OR client_id = ${clientId})
      `
    },

    async getCountedTypes() {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`
        SELECT value FROM portal_settings WHERE key = 'counted_appointment_types' LIMIT 1
      `
      const value = (rows[0] as { value?: string } | undefined)?.value
      if (!value) return [...DEFAULT_COUNTED_TYPES]
      try {
        const parsed = JSON.parse(value)
        if (!Array.isArray(parsed)) return [...DEFAULT_COUNTED_TYPES]
        return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
      } catch {
        return [...DEFAULT_COUNTED_TYPES]
      }
    },

    async setCountedTypes(types) {
      await ensureReady()
      const sql = sqlClient()
      const encoded = JSON.stringify(types)
      await sql`
        INSERT INTO portal_settings (key, value)
        VALUES ('counted_appointment_types', ${encoded})
        ON CONFLICT (key) DO UPDATE SET value = ${encoded}
      `
    },

    async countRecentMagicLinks(clientId, sinceIso) {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`
        SELECT COUNT(*) AS count FROM magic_links
        WHERE client_id = ${clientId}
          AND created_at >= CAST(${sinceIso} AS timestamptz)
      `
      return Number((rows[0] as { count: string | number }).count)
    },

    async createMagicLink(clientId, tokenHash, expiresAt) {
      await ensureReady()
      const sql = sqlClient()
      await sql`
        INSERT INTO magic_links (client_id, token_hash, expires_at)
        VALUES (${clientId}, ${tokenHash}, CAST(${expiresAt} AS timestamptz))
      `
    },

    async consumeMagicLink(tokenHash, nowIso) {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`
        UPDATE magic_links
        SET used_at = CAST(${nowIso} AS timestamptz)
        WHERE token_hash = ${tokenHash}
          AND used_at IS NULL
          AND expires_at > CAST(${nowIso} AS timestamptz)
        RETURNING client_id
      `
      const clientId = (rows[0] as { client_id: number } | undefined)?.client_id
      if (!clientId) return null
      const client = await clientById(Number(clientId))
      if (!client?.active) return null
      return client
    },

    async createSession(clientId, tokenHash, expiresAt) {
      await ensureReady()
      const sql = sqlClient()
      await sql`
        INSERT INTO portal_sessions (token_hash, client_id, expires_at)
        VALUES (${tokenHash}, ${clientId}, CAST(${expiresAt} AS timestamptz))
        ON CONFLICT (token_hash) DO UPDATE SET
          client_id = ${clientId},
          expires_at = CAST(${expiresAt} AS timestamptz)
      `
    },

    async getClientBySession(tokenHash, nowIso) {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`
        SELECT client_id FROM portal_sessions
        WHERE token_hash = ${tokenHash}
          AND expires_at > CAST(${nowIso} AS timestamptz)
        LIMIT 1
      `
      const clientId = (rows[0] as { client_id: number } | undefined)?.client_id
      if (!clientId) return null
      const client = await clientById(Number(clientId))
      if (!client?.active) return null
      return client
    },

    async deleteSession(tokenHash) {
      await ensureReady()
      const sql = sqlClient()
      await sql`DELETE FROM portal_sessions WHERE token_hash = ${tokenHash}`
    },

    async findBriefShootDates(name, email) {
      await ensureReady()
      const sql = sqlClient()
      try {
        const rows = await sql`
          SELECT shoot_date FROM briefs
          WHERE lower(agent_name) = ${name.trim().toLowerCase()}
             OR lower(client_name) = ${normalizeEmail(email)}
             OR lower(client_name) = ${name.trim().toLowerCase()}
        `
        return (rows as { shoot_date: string }[]).map((row) => String(row.shoot_date).slice(0, 10))
      } catch {
        return []
      }
    },
  }
}
