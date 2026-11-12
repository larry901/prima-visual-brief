import { neon } from '@neondatabase/serverless'
import {
  createBriefRecord as insertBriefRecord,
  getAllBriefs,
  getBriefByEditTokenHash as findBriefByToken,
  getBriefById as findBrief,
  listBriefsForOwner,
  updateBriefRecord as saveBriefRecord,
} from '../db'
import {
  attachClientEmails,
  clientEmailAddresses,
  emailList,
  normalizeClientEmails,
  readFrameioUrl,
  readStoredPlanSize,
} from './clients'
import { DEFAULT_COUNTED_TYPES } from './cycle'
import { normalizeEmail } from './ingest'
import { PERSONAL_LINK_DAY_WINDOW_MS } from './personal-link'
import type {
  AppointmentPatch,
  AppointmentRecord,
  AppointmentStatus,
  ClientInput,
  ClientKind,
  ClientRecord,
  NewAppointment,
  PersonalLinkRow,
  PortalStore,
} from './types'

function sqlClient() {
  const url = process.env.POSTGRES_URL
  if (!url) throw new Error('POSTGRES_URL environment variable is not set')
  return neon(url)
}

function asDate(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const text = String(value)
  if (!text || text === 'null') return null
  return text.slice(0, 10)
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString()
}

function asBool(value: unknown): boolean {
  return value === true || value === 't' || value === 'true' || value === 1
}

function asPlan(value: unknown) {
  return readStoredPlanSize(value)
}

/**
 * True when a Postgres CHECK definition already allows plan sizes 1, 2, and 4.
 * `pg_get_constraintdef` prints `IN (1, 2, 4)` as `= ANY (ARRAY[1, 2, 4])`.
 */
export function planSizeConstraintAllowsOne(definition: string): boolean {
  return /\b1\b/.test(definition) && /\b2\b/.test(definition) && /\b4\b/.test(definition)
}

function asKind(value: unknown): ClientKind {
  return value === 'project' ? 'project' : 'subscription'
}

function asAnchor(value: unknown): number | null {
  if (value == null || value === '') return null
  const day = Number(value)
  if (!Number.isInteger(day) || day < 1 || day > 31) return null
  return day
}

function storedPlan(input: ClientInput, existing: ClientRecord | null) {
  if (input.kind === 'project') {
    return { planSize: null, renewalDate: null, billingAnchorDay: null }
  }
  const renewalDate = input.renewalDate
  const billingAnchorDay =
    existing && existing.renewalDate === renewalDate && existing.billingAnchorDay
      ? existing.billingAnchorDay
      : renewalDate
        ? Number(renewalDate.slice(8, 10))
        : null
  return { planSize: input.planSize, renewalDate, billingAnchorDay }
}

interface ClientRow {
  id: number
  name: string
  email: string
  company: string | null
  client_kind: string | null
  plan_size: number | null
  renewal_date: string | Date | null
  billing_anchor_day: number | null
  scheduling_link: string | null
  frameio_url: string | null
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

interface PersonalLinkSqlRow {
  client_id: number
  token_hash: string
  token_cipher: string
}

function mapPersonalLink(row: PersonalLinkSqlRow): PersonalLinkRow {
  return {
    clientId: Number(row.client_id),
    tokenHash: String(row.token_hash),
    tokenCipher: String(row.token_cipher),
  }
}

function mapClient(row: ClientRow, additionalEmails: string[] = []): ClientRecord {
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    additionalEmails,
    company: row.company ?? '',
    kind: asKind(row.client_kind),
    planSize: asPlan(row.plan_size),
    renewalDate: asDate(row.renewal_date),
    billingAnchorDay: asAnchor(row.billing_anchor_day),
    schedulingLink: row.scheduling_link?.trim() || null,
    frameioUrl: readFrameioUrl(row.frameio_url) || readFrameioUrl(row.frameio_links),
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

async function ensurePlanSizeAllowsOne(sql: ReturnType<typeof sqlClient>): Promise<void> {
  const rows = (await sql`
    SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'clients'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%plan_size%'
  `) as { definition: string }[]
  if (rows.length > 0 && rows.every((row) => planSizeConstraintAllowsOne(String(row.definition ?? '')))) {
    return
  }
  await sql`
    DO $plan$
    DECLARE
      constraint_name text;
    BEGIN
      FOR constraint_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'clients'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%plan_size%'
      LOOP
        EXECUTE format('ALTER TABLE clients DROP CONSTRAINT %I', constraint_name);
      END LOOP;

      ALTER TABLE clients
        ADD CONSTRAINT clients_plan_size_check
        CHECK (plan_size IS NULL OR plan_size IN (1, 2, 4));
    END
    $plan$;
  `
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
        client_kind TEXT NOT NULL DEFAULT 'subscription',
        plan_size INTEGER CHECK (plan_size IS NULL OR plan_size IN (1, 2, 4)),
        renewal_date DATE,
        billing_anchor_day INTEGER CHECK (billing_anchor_day IS NULL OR billing_anchor_day BETWEEN 1 AND 31),
        scheduling_link TEXT,
        frameio_url TEXT,
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
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_kind TEXT NOT NULL DEFAULT 'subscription'`
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS scheduling_link TEXT`
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS frameio_url TEXT`
    await sql`ALTER TABLE clients ALTER COLUMN plan_size DROP NOT NULL`
    await sql`ALTER TABLE clients ALTER COLUMN renewal_date DROP NOT NULL`
    await sql`ALTER TABLE clients ALTER COLUMN billing_anchor_day DROP NOT NULL`
    // CREATE TABLE IF NOT EXISTS does not change a check that already exists.
    // Widen the original (2, 4) check so a 1-shoot plan can be saved.
    await ensurePlanSizeAllowsOne(sql)
    // Extra addresses live in a new table. Existing clients keep clients.email and need no rows.
    await sql`
      CREATE TABLE IF NOT EXISTS client_emails (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS client_emails_email_lower_idx ON client_emails (lower(email))`
    await sql`CREATE INDEX IF NOT EXISTS client_emails_client_id_idx ON client_emails (client_id)`
    await sql`
      CREATE OR REPLACE FUNCTION reject_overlapping_client_email() RETURNS trigger AS $fn$
      BEGIN
        IF TG_TABLE_NAME = 'client_emails' THEN
          IF EXISTS (SELECT 1 FROM clients WHERE lower(email) = lower(NEW.email)) THEN
            RAISE EXCEPTION 'duplicate key value violates unique constraint "email"';
          END IF;
        ELSIF TG_TABLE_NAME = 'clients' THEN
          IF EXISTS (
            SELECT 1 FROM client_emails
            WHERE lower(email) = lower(NEW.email)
              AND client_id IS DISTINCT FROM NEW.id
          ) THEN
            RAISE EXCEPTION 'duplicate key value violates unique constraint "email"';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $fn$ LANGUAGE plpgsql
    `
    await sql`
      DO $trg$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'client_emails_reject_overlap') THEN
          CREATE TRIGGER client_emails_reject_overlap
          BEFORE INSERT OR UPDATE OF email ON client_emails
          FOR EACH ROW EXECUTE FUNCTION reject_overlapping_client_email();
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'clients_reject_email_overlap') THEN
          CREATE TRIGGER clients_reject_email_overlap
          BEFORE INSERT OR UPDATE OF email ON clients
          FOR EACH ROW EXECUTE FUNCTION reject_overlapping_client_email();
        END IF;
      END
      $trg$
    `
    // Raw portal tokens are never stored. token_hash is SHA-256. token_cipher is
    // AES-256-GCM under a key derived from DASHBOARD_PASSWORD so staff can show the link.
    // Created on the first portal, roster, or ingest request, same as the tables above.
    await sql`
      CREATE TABLE IF NOT EXISTS client_portal_links (
        client_id INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        token_cipher TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`
      CREATE TABLE IF NOT EXISTS portal_link_attempts (
        id SERIAL PRIMARY KEY,
        token_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`
      CREATE INDEX IF NOT EXISTS portal_link_attempts_token_created_idx
      ON portal_link_attempts (token_hash, created_at)
    `
  }

  async function additionalEmailsFor(clientId: number): Promise<string[]> {
    const sql = sqlClient()
    const rows = await sql`
      SELECT email FROM client_emails WHERE client_id = ${clientId} ORDER BY id ASC
    `
    return (rows as { email: string }[]).map((row) => row.email)
  }

  async function hydrate(row: ClientRow): Promise<ClientRecord> {
    return mapClient(row, await additionalEmailsFor(Number(row.id)))
  }

  async function clientById(id: number): Promise<ClientRecord | null> {
    const sql = sqlClient()
    const rows = await sql`SELECT * FROM clients WHERE id = ${id} LIMIT 1`
    return rows[0] ? hydrate(rows[0] as ClientRow) : null
  }

  async function assertEmailsAvailable(emails: string[], exceptId: number | null) {
    const sql = sqlClient()
    for (const email of emails) {
      const primary =
        exceptId == null
          ? await sql`SELECT id FROM clients WHERE lower(email) = ${email} LIMIT 1`
          : await sql`SELECT id FROM clients WHERE lower(email) = ${email} AND id <> ${exceptId} LIMIT 1`
      if (primary.length > 0) throw new Error('A client with that email already exists')
      const extra =
        exceptId == null
          ? await sql`SELECT client_id FROM client_emails WHERE lower(email) = ${email} LIMIT 1`
          : await sql`SELECT client_id FROM client_emails WHERE lower(email) = ${email} AND client_id <> ${exceptId} LIMIT 1`
      if (extra.length > 0) throw new Error('A client with that email already exists')
    }
  }

  async function attachUnmatchedEmail(email: string, clientId: number) {
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
  }

  async function syncAdditionalEmails(clientId: number, emails: string[]) {
    const sql = sqlClient()
    const current = await sql`SELECT email FROM client_emails WHERE client_id = ${clientId}`
    const have = new Set((current as { email: string }[]).map((row) => row.email.toLowerCase()))
    const want = new Set(emails)
    for (const email of Array.from(have)) {
      if (!want.has(email)) {
        await sql`DELETE FROM client_emails WHERE client_id = ${clientId} AND lower(email) = ${email}`
      }
    }
    for (const email of emails) {
      if (!have.has(email)) {
        await sql`INSERT INTO client_emails (client_id, email) VALUES (${clientId}, ${email})`
      }
    }
  }

  return {
    ensureReady,

    async listClients() {
      await ensureReady()
      const sql = sqlClient()
      const rows = (await sql`SELECT * FROM clients ORDER BY lower(name) ASC`) as ClientRow[]
      const extras = (await sql`SELECT client_id, email FROM client_emails ORDER BY id ASC`) as {
        client_id: number
        email: string
      }[]
      const byId = new Map<number, string[]>()
      for (const extra of extras) {
        const id = Number(extra.client_id)
        const list = byId.get(id) ?? []
        list.push(extra.email)
        byId.set(id, list)
      }
      return rows.map((row) => mapClient(row, byId.get(Number(row.id)) ?? []))
    },

    async getClient(id) {
      await ensureReady()
      return clientById(id)
    },

    async findClientByEmail(email) {
      await ensureReady()
      const sql = sqlClient()
      const norm = normalizeEmail(email)
      const primary = await sql`SELECT * FROM clients WHERE lower(email) = ${norm} LIMIT 1`
      if (primary[0]) return hydrate(primary[0] as ClientRow)
      const viaExtra = await sql`
        SELECT c.* FROM clients c
        INNER JOIN client_emails e ON e.client_id = c.id
        WHERE lower(e.email) = ${norm}
        LIMIT 1
      `
      return viaExtra[0] ? hydrate(viaExtra[0] as ClientRow) : null
    },

    async createClient(input: ClientInput) {
      await ensureReady()
      const sql = sqlClient()
      const emails = normalizeClientEmails(input)
      await assertEmailsAvailable(clientEmailAddresses(emails), null)
      const plan = storedPlan(input, null)
      try {
        const rows = await sql`
          INSERT INTO clients (
            name, email, company, client_kind, plan_size, renewal_date, billing_anchor_day,
            scheduling_link, frameio_url, frameio_links, active
          ) VALUES (
            ${input.name},
            ${emails.email},
            ${input.company},
            ${input.kind},
            ${plan.planSize},
            ${plan.renewalDate},
            ${plan.billingAnchorDay},
            ${input.schedulingLink},
            ${input.frameioUrl},
            ${input.frameioUrl ?? '[]'},
            ${input.active}
          )
          RETURNING *
        `
        const created = mapClient(rows[0] as ClientRow, emails.additionalEmails)
        await syncAdditionalEmails(created.id, emails.additionalEmails)
        await attachClientEmails({ attachUnmatched: attachUnmatchedEmail }, created)
        return created
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
      const emails = normalizeClientEmails(input)
      await assertEmailsAvailable(clientEmailAddresses(emails), id)
      const plan = storedPlan(input, existing)
      try {
        const rows = await sql`
          UPDATE clients SET
            name = ${input.name},
            email = ${emails.email},
            company = ${input.company},
            client_kind = ${input.kind},
            plan_size = ${plan.planSize},
            renewal_date = ${plan.renewalDate},
            billing_anchor_day = ${plan.billingAnchorDay},
            scheduling_link = ${input.schedulingLink},
            frameio_url = ${input.frameioUrl},
            frameio_links = ${input.frameioUrl ?? '[]'},
            active = ${input.active},
            updated_at = NOW()
          WHERE id = ${id}
          RETURNING *
        `
        if (!rows[0]) throw new Error('Client not found')
        await syncAdditionalEmails(id, emails.additionalEmails)
        const saved = mapClient(rows[0] as ClientRow, emails.additionalEmails)
        await attachClientEmails({ attachUnmatched: attachUnmatchedEmail }, saved)
        return saved
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
      await attachUnmatchedEmail(email, clientId)
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

    async getPersonalLink(clientId) {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`
        SELECT client_id, token_hash, token_cipher
        FROM client_portal_links
        WHERE client_id = ${clientId}
        LIMIT 1
      `
      return rows[0] ? mapPersonalLink(rows[0] as PersonalLinkSqlRow) : null
    },

    async listPersonalLinks() {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`
        SELECT client_id, token_hash, token_cipher FROM client_portal_links
      `
      return (rows as PersonalLinkSqlRow[]).map(mapPersonalLink)
    },

    async findClientByPersonalLink(tokenHash) {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`
        SELECT client_id FROM client_portal_links WHERE token_hash = ${tokenHash} LIMIT 1
      `
      const clientId = (rows[0] as { client_id: number } | undefined)?.client_id
      if (!clientId) return null
      return clientById(Number(clientId))
    },

    async insertPersonalLink(clientId, tokenHash, tokenCipher) {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`
        INSERT INTO client_portal_links (client_id, token_hash, token_cipher)
        VALUES (${clientId}, ${tokenHash}, ${tokenCipher})
        ON CONFLICT (client_id) DO NOTHING
        RETURNING client_id
      `
      return rows.length > 0
    },

    async replacePersonalLink(clientId, tokenHash, tokenCipher) {
      await ensureReady()
      const sql = sqlClient()
      await sql`
        INSERT INTO client_portal_links (client_id, token_hash, token_cipher)
        VALUES (${clientId}, ${tokenHash}, ${tokenCipher})
        ON CONFLICT (client_id) DO UPDATE SET
          token_hash = EXCLUDED.token_hash,
          token_cipher = EXCLUDED.token_cipher,
          updated_at = NOW()
      `
    },

    async countPersonalLinkAttempts(tokenHash, sinceIso) {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`
        SELECT COUNT(*) AS count FROM portal_link_attempts
        WHERE token_hash = ${tokenHash}
          AND created_at >= CAST(${sinceIso} AS timestamptz)
      `
      return Number((rows[0] as { count: string | number }).count)
    },

    async recordPersonalLinkAttempt(tokenHash, nowIso) {
      await ensureReady()
      const sql = sqlClient()
      const cutoff = new Date(new Date(nowIso).getTime() - PERSONAL_LINK_DAY_WINDOW_MS).toISOString()
      await sql`
        DELETE FROM portal_link_attempts
        WHERE created_at < CAST(${cutoff} AS timestamptz)
      `
      await sql`
        INSERT INTO portal_link_attempts (token_hash, created_at)
        VALUES (${tokenHash}, CAST(${nowIso} AS timestamptz))
      `
    },

    async clearPersonalLinkAttempts(tokenHash) {
      await ensureReady()
      const sql = sqlClient()
      await sql`DELETE FROM portal_link_attempts WHERE token_hash = ${tokenHash}`
    },

    async listAllBriefs() {
      return getAllBriefs()
    },

    async getBriefById(id) {
      return findBrief(id)
    },

    async listBriefsForClient(clientId, email) {
      return listBriefsForOwner(clientId, email)
    },

    async getBriefByEditTokenHash(tokenHash) {
      return findBriefByToken(tokenHash)
    },

    async createBriefRecord(row) {
      return insertBriefRecord(row)
    },

    async updateBriefRecord(id, patch) {
      const updated = await saveBriefRecord(id, patch)
      if (!updated) throw new Error('Brief not found')
      return updated
    },

    async findBriefShootDates(name, email) {
      await ensureReady()
      const sql = sqlClient()
      const emails = emailList(email)
      const nameKey = name.trim().toLowerCase()
      try {
        const rows = await sql`
          SELECT shoot_date FROM briefs
          WHERE lower(agent_name) = ${nameKey}
             OR lower(client_name) = ${nameKey}
             OR lower(client_name) = ANY(${emails})
             OR lower(client_email) = ANY(${emails})
        `
        return (rows as { shoot_date: string }[]).map((row) => String(row.shoot_date).slice(0, 10))
      } catch {
        return []
      }
    },
  }
}
