import { neon } from '@neondatabase/serverless'
import { normalizeEmail } from '../portal/email'
import { getPortalStore } from '../portal/store'
import type { PlanSize } from '../portal/types'
import { isPlanSize } from './money'
import {
  isDiscoveryStatus,
  isLeadSource,
  isLeadStage,
  isServiceType,
  isTouchKind,
  type HubStore,
  type LeadPatch,
  type LeadRecord,
  type LeadSource,
  type LeadStage,
  type NewLead,
  type NewTouch,
  type ServiceType,
  type StageEvent,
  type TouchRecord,
  type DiscoveryStatus,
} from './types'

function sqlClient() {
  const url = process.env.POSTGRES_URL
  if (!url) throw new Error('POSTGRES_URL environment variable is not set')
  return neon(url)
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString()
}

function asDate(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const text = String(value)
  if (!text || text === 'null') return null
  return text.slice(0, 10)
}

function asStage(value: unknown): LeadStage {
  return isLeadStage(value) ? value : 'New'
}

function asSource(value: unknown): LeadSource {
  return isLeadSource(value) ? value : 'Other'
}

function asService(value: unknown): ServiceType | null {
  return isServiceType(value) ? value : null
}

function asDiscovery(value: unknown): DiscoveryStatus | null {
  return isDiscoveryStatus(value) ? value : null
}

function asDollars(value: unknown): number | null {
  if (value == null || value === '') return null
  const amount = Number(value)
  if (!Number.isInteger(amount)) return null
  return amount
}

interface LeadRow {
  id: number
  name: string
  company: string | null
  email: string | null
  phone: string | null
  source: string
  referred_by: string | null
  stage: string
  estimated_value_dollars: number | null
  service_type: string | null
  notes: string | null
  next_follow_up: unknown
  lost_reason: string | null
  acuity_appointment_id: string | null
  discovery_start_at: unknown
  discovery_status: string | null
  converted_client_id: number | null
  created_at: unknown
  updated_at: unknown
}

function mapLead(row: LeadRow): LeadRecord {
  return {
    id: Number(row.id),
    name: row.name,
    company: row.company ?? '',
    email: row.email ? normalizeEmail(row.email) : '',
    phone: row.phone ?? '',
    source: asSource(row.source),
    referredBy: row.referred_by ?? '',
    stage: asStage(row.stage),
    estimatedValueDollars: asDollars(row.estimated_value_dollars),
    serviceType: asService(row.service_type),
    notes: row.notes ?? '',
    nextFollowUp: asDate(row.next_follow_up),
    lostReason: row.lost_reason ?? '',
    acuityAppointmentId: row.acuity_appointment_id,
    discoveryStartAt: row.discovery_start_at == null ? null : asIso(row.discovery_start_at),
    discoveryStatus: asDiscovery(row.discovery_status),
    convertedClientId: row.converted_client_id == null ? null : Number(row.converted_client_id),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  }
}

function requireDollars(value: number | null | undefined): number | null {
  if (value == null) return null
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw new Error('Amount must be a whole dollar value from 0 to 1,000,000')
  }
  return value
}

/**
 * Hub tables are created on the first hub read or discovery-lead write.
 * CREATE TABLE IF NOT EXISTS matches the portal. It does not rewrite portal rows.
 */
export function createNeonHubStore(): HubStore {
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
    await getPortalStore().ensureReady()
    const sql = sqlClient()
    await sql`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        company TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL,
        referred_by TEXT NOT NULL DEFAULT '',
        stage TEXT NOT NULL,
        estimated_value_dollars INTEGER,
        service_type TEXT,
        notes TEXT NOT NULL DEFAULT '',
        next_follow_up DATE,
        lost_reason TEXT NOT NULL DEFAULT '',
        acuity_appointment_id TEXT,
        discovery_start_at TIMESTAMPTZ,
        discovery_status TEXT,
        converted_client_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS leads_email_idx ON leads (lower(email))`
    await sql`CREATE INDEX IF NOT EXISTS leads_follow_up_idx ON leads (next_follow_up)`
    await sql`
      CREATE TABLE IF NOT EXISTS lead_stage_events (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        from_stage TEXT,
        to_stage TEXT NOT NULL,
        at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS lead_stage_events_lead_idx ON lead_stage_events (lead_id, at)`
    await sql`
      CREATE TABLE IF NOT EXISTS lead_touches (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS lead_touches_lead_idx ON lead_touches (lead_id, at DESC)`
    await sql`
      CREATE TABLE IF NOT EXISTS hub_plan_prices (
        plan_size INTEGER PRIMARY KEY CHECK (plan_size IN (1, 2, 4)),
        monthly_dollars INTEGER NOT NULL CHECK (monthly_dollars >= 0)
      )
    `
    await sql`
      CREATE TABLE IF NOT EXISTS hub_client_prices (
        client_id INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
        monthly_dollars INTEGER NOT NULL CHECK (monthly_dollars >= 0)
      )
    `
    await sql`
      CREATE TABLE IF NOT EXISTS hub_magic_links (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS hub_magic_links_email_idx ON hub_magic_links (email, created_at)`
    await sql`
      CREATE TABLE IF NOT EXISTS hub_sessions (
        token_hash TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  }

  async function leadById(id: number): Promise<LeadRecord | null> {
    const sql = sqlClient()
    const rows = await sql`SELECT * FROM leads WHERE id = ${id} LIMIT 1`
    return rows[0] ? mapLead(rows[0] as LeadRow) : null
  }

  return {
    ensureReady,

    async listLeads() {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`SELECT * FROM leads ORDER BY updated_at DESC, id DESC`
      return (rows as LeadRow[]).map(mapLead)
    },

    async getLead(id) {
      await ensureReady()
      return leadById(id)
    },

    async createLead(input: NewLead, now: Date = new Date()) {
      await ensureReady()
      const name = input.name.trim()
      if (!name) throw new Error('name is required')
      if (!isLeadSource(input.source) || !isLeadStage(input.stage)) throw new Error('Invalid lead')
      const nowIso = now.toISOString()
      const sql = sqlClient()
      const rows = await sql`
        INSERT INTO leads (
          name, company, email, phone, source, referred_by, stage,
          estimated_value_dollars, service_type, notes, next_follow_up, lost_reason,
          acuity_appointment_id, discovery_start_at, discovery_status, converted_client_id,
          created_at, updated_at
        ) VALUES (
          ${name},
          ${input.company?.trim() ?? ''},
          ${input.email ? normalizeEmail(input.email) : ''},
          ${input.phone?.trim() ?? ''},
          ${input.source},
          ${input.referredBy?.trim() ?? ''},
          ${input.stage},
          ${requireDollars(input.estimatedValueDollars)},
          ${input.serviceType ?? null},
          ${input.notes ?? ''},
          ${input.nextFollowUp ?? null},
          ${input.lostReason?.trim() ?? ''},
          ${input.acuityAppointmentId ?? null},
          ${input.discoveryStartAt ?? null},
          ${input.discoveryStatus ?? null},
          ${input.convertedClientId ?? null},
          ${nowIso},
          ${nowIso}
        )
        RETURNING *
      `
      const lead = mapLead(rows[0] as LeadRow)
      await sql`
        INSERT INTO lead_stage_events (lead_id, from_stage, to_stage, at)
        VALUES (${lead.id}, ${null}, ${lead.stage}, ${nowIso})
      `
      return lead
    },

    async updateLead(id: number, patch: LeadPatch, now: Date = new Date()) {
      await ensureReady()
      const current = await leadById(id)
      if (!current) throw new Error('Lead not found')
      const next: LeadRecord = { ...current }
      if (patch.name !== undefined) next.name = patch.name.trim()
      if (patch.company !== undefined) next.company = patch.company.trim()
      if (patch.email !== undefined) next.email = patch.email ? normalizeEmail(patch.email) : ''
      if (patch.phone !== undefined) next.phone = patch.phone.trim()
      if (patch.source !== undefined) next.source = patch.source
      if (patch.referredBy !== undefined) next.referredBy = patch.referredBy.trim()
      if (patch.stage !== undefined) next.stage = patch.stage
      if (patch.estimatedValueDollars !== undefined) next.estimatedValueDollars = requireDollars(patch.estimatedValueDollars)
      if (patch.serviceType !== undefined) next.serviceType = patch.serviceType
      if (patch.notes !== undefined) next.notes = patch.notes
      if (patch.nextFollowUp !== undefined) next.nextFollowUp = patch.nextFollowUp
      if (patch.lostReason !== undefined) next.lostReason = patch.lostReason.trim()
      if (patch.acuityAppointmentId !== undefined) next.acuityAppointmentId = patch.acuityAppointmentId
      if (patch.discoveryStartAt !== undefined) next.discoveryStartAt = patch.discoveryStartAt
      if (patch.discoveryStatus !== undefined) next.discoveryStatus = patch.discoveryStatus
      if (patch.convertedClientId !== undefined) next.convertedClientId = patch.convertedClientId
      if (!next.name) throw new Error('name is required')
      const nowIso = now.toISOString()
      const sql = sqlClient()
      const rows = await sql`
        UPDATE leads SET
          name = ${next.name},
          company = ${next.company},
          email = ${next.email},
          phone = ${next.phone},
          source = ${next.source},
          referred_by = ${next.referredBy},
          stage = ${next.stage},
          estimated_value_dollars = ${next.estimatedValueDollars},
          service_type = ${next.serviceType},
          notes = ${next.notes},
          next_follow_up = ${next.nextFollowUp},
          lost_reason = ${next.lostReason},
          acuity_appointment_id = ${next.acuityAppointmentId},
          discovery_start_at = ${next.discoveryStartAt},
          discovery_status = ${next.discoveryStatus},
          converted_client_id = ${next.convertedClientId},
          updated_at = ${nowIso}
        WHERE id = ${id}
        RETURNING *
      `
      if (next.stage !== current.stage) {
        await sql`
          INSERT INTO lead_stage_events (lead_id, from_stage, to_stage, at)
          VALUES (${id}, ${current.stage}, ${next.stage}, ${nowIso})
        `
      }
      return mapLead(rows[0] as LeadRow)
    },

    async listStageEvents(leadId?: number) {
      await ensureReady()
      const sql = sqlClient()
      const rows =
        leadId == null
          ? await sql`SELECT * FROM lead_stage_events ORDER BY at ASC, id ASC`
          : await sql`SELECT * FROM lead_stage_events WHERE lead_id = ${leadId} ORDER BY at ASC, id ASC`
      return (rows as { id: number; lead_id: number; from_stage: string | null; to_stage: string; at: unknown }[]).map(
        (row) => ({
          id: Number(row.id),
          leadId: Number(row.lead_id),
          fromStage: row.from_stage && isLeadStage(row.from_stage) ? row.from_stage : null,
          toStage: asStage(row.to_stage),
          at: asIso(row.at),
        }),
      ) satisfies StageEvent[]
    },

    async addTouch(input: NewTouch, now: Date = new Date()) {
      await ensureReady()
      const lead = await leadById(input.leadId)
      if (!lead) throw new Error('Lead not found')
      if (!isTouchKind(input.kind)) throw new Error('Unknown touch')
      const nowIso = now.toISOString()
      const sql = sqlClient()
      const rows = await sql`
        INSERT INTO lead_touches (lead_id, kind, note, at)
        VALUES (${input.leadId}, ${input.kind}, ${input.note?.trim() ?? ''}, ${nowIso})
        RETURNING *
      `
      const row = rows[0] as { id: number; lead_id: number; kind: string; note: string; at: unknown }
      return {
        id: Number(row.id),
        leadId: Number(row.lead_id),
        kind: input.kind,
        note: row.note ?? '',
        at: asIso(row.at),
      } satisfies TouchRecord
    },

    async listTouches(leadId?: number) {
      await ensureReady()
      const sql = sqlClient()
      const rows =
        leadId == null
          ? await sql`SELECT * FROM lead_touches ORDER BY at DESC, id DESC`
          : await sql`SELECT * FROM lead_touches WHERE lead_id = ${leadId} ORDER BY at DESC, id DESC`
      const touches: TouchRecord[] = []
      for (const row of rows as { id: number; lead_id: number; kind: string; note: string | null; at: unknown }[]) {
        if (!isTouchKind(row.kind)) continue
        touches.push({
          id: Number(row.id),
          leadId: Number(row.lead_id),
          kind: row.kind,
          note: row.note ?? '',
          at: asIso(row.at),
        })
      }
      return touches
    },

    async getPlanPrices() {
      await ensureReady()
      const sql = sqlClient()
      const rows = (await sql`SELECT plan_size, monthly_dollars FROM hub_plan_prices`) as {
        plan_size: number
        monthly_dollars: number
      }[]
      const prices: Partial<Record<PlanSize, number>> = {}
      for (const row of rows) {
        const size = Number(row.plan_size)
        if (isPlanSize(size)) prices[size] = Number(row.monthly_dollars)
      }
      return prices
    },

    async setPlanPrice(planSize, monthlyDollars) {
      await ensureReady()
      if (!isPlanSize(planSize)) throw new Error('Plan must be 1, 2, or 4')
      const sql = sqlClient()
      if (monthlyDollars == null) {
        await sql`DELETE FROM hub_plan_prices WHERE plan_size = ${planSize}`
        return
      }
      const amount = requireDollars(monthlyDollars) ?? 0
      await sql`
        INSERT INTO hub_plan_prices (plan_size, monthly_dollars)
        VALUES (${planSize}, ${amount})
        ON CONFLICT (plan_size) DO UPDATE SET monthly_dollars = EXCLUDED.monthly_dollars
      `
    },

    async getClientPrices() {
      await ensureReady()
      const sql = sqlClient()
      const rows = (await sql`SELECT client_id, monthly_dollars FROM hub_client_prices`) as {
        client_id: number
        monthly_dollars: number
      }[]
      return new Map(rows.map((row) => [Number(row.client_id), Number(row.monthly_dollars)]))
    },

    async releaseClient(clientId) {
      await ensureReady()
      const sql = sqlClient()
      await sql`DELETE FROM hub_client_prices WHERE client_id = ${clientId}`
      await sql`
        UPDATE leads
        SET converted_client_id = NULL
        WHERE converted_client_id = ${clientId}
      `
    },

    async setClientPrice(clientId, monthlyDollars) {
      await ensureReady()
      const sql = sqlClient()
      if (monthlyDollars == null) {
        await sql`DELETE FROM hub_client_prices WHERE client_id = ${clientId}`
        return
      }
      const amount = requireDollars(monthlyDollars) ?? 0
      await sql`
        INSERT INTO hub_client_prices (client_id, monthly_dollars)
        VALUES (${clientId}, ${amount})
        ON CONFLICT (client_id) DO UPDATE SET monthly_dollars = EXCLUDED.monthly_dollars
      `
    },

    async countRecentStaffLinks(email, sinceIso) {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`
        SELECT COUNT(*)::int AS count
        FROM hub_magic_links
        WHERE email = ${normalizeEmail(email)}
          AND created_at >= ${sinceIso}
      `
      return Number((rows[0] as { count: number }).count ?? 0)
    },

    async createStaffMagicLink(email, tokenHash, expiresAt, now: Date = new Date()) {
      await ensureReady()
      const sql = sqlClient()
      await sql`
        INSERT INTO hub_magic_links (email, token_hash, expires_at, created_at)
        VALUES (${normalizeEmail(email)}, ${tokenHash}, ${expiresAt}, ${now.toISOString()})
      `
    },

    async consumeStaffMagicLink(tokenHash, nowIso) {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`
        UPDATE hub_magic_links
        SET used_at = ${nowIso}
        WHERE token_hash = ${tokenHash}
          AND used_at IS NULL
          AND expires_at > ${nowIso}
        RETURNING email
      `
      const email = (rows[0] as { email?: string } | undefined)?.email
      return email ? normalizeEmail(email) : null
    },

    async createStaffSession(email, tokenHash, expiresAt) {
      await ensureReady()
      const sql = sqlClient()
      await sql`
        INSERT INTO hub_sessions (token_hash, email, expires_at)
        VALUES (${tokenHash}, ${normalizeEmail(email)}, ${expiresAt})
        ON CONFLICT (token_hash) DO UPDATE SET email = EXCLUDED.email, expires_at = EXCLUDED.expires_at
      `
    },

    async getStaffBySession(tokenHash, nowIso) {
      await ensureReady()
      const sql = sqlClient()
      const rows = await sql`
        SELECT email FROM hub_sessions
        WHERE token_hash = ${tokenHash} AND expires_at > ${nowIso}
        LIMIT 1
      `
      const email = (rows[0] as { email?: string } | undefined)?.email
      return email ? normalizeEmail(email) : null
    },

    async deleteStaffSession(tokenHash) {
      await ensureReady()
      const sql = sqlClient()
      await sql`DELETE FROM hub_sessions WHERE token_hash = ${tokenHash}`
    },
  }
}
