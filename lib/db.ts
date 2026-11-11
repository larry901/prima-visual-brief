import { neon } from '@neondatabase/serverless'

// ---------------------------------------------------------------------------
// Connection — module-level singleton, safe across serverless invocations
// ---------------------------------------------------------------------------
function getSql() {
  const url = process.env.POSTGRES_URL
  if (!url) throw new Error('POSTGRES_URL environment variable is not set')
  return neon(url)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrackRef {
  id: string
  name: string
  artist: string
  albumArt: string | null
  previewUrl: string | null
  spotifyUrl: string
}

export interface VideoDetail {
  highlights: string
  avoid: string
  selectedTracks: TrackRef[]
  referenceArtist: string
  inspirationLinks: string[]
  inspirationThoughts: string
  script: string
}

export interface BriefRow {
  id: number
  client_name: string
  agent_name: string
  property_address: string
  shoot_date: string
  agent_on_site: string
  gate_code: string | null
  lockbox_code: string | null
  access_notes: string | null
  video_types: string
  video_details: string
  drive_link: string | null
  asset_notes: string | null
  file_paths: string
  submitted_at: string
  client_id: number | null
  client_email: string | null
  updated_at: string | null
  edited_by_client: boolean
  previous_snapshot: string | null
  edit_token_hash: string | null
}

export interface NewBriefRecord {
  client_name: string
  client_email: string | null
  client_id: number | null
  agent_name: string
  property_address: string
  shoot_date: string
  agent_on_site: string
  gate_code: string | null
  lockbox_code: string | null
  access_notes: string | null
  video_types: string
  video_details: string
  drive_link: string | null
  asset_notes: string | null
  file_paths: string
  edit_token_hash: string | null
}

export interface BriefUpdate {
  agent_name: string
  property_address: string
  shoot_date: string
  agent_on_site: string
  gate_code: string | null
  lockbox_code: string | null
  access_notes: string | null
  video_types: string
  video_details: string
  drive_link: string | null
  asset_notes: string | null
  previous_snapshot: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Schema bootstrap — idempotent, called before every query
// ---------------------------------------------------------------------------

let tableReady: Promise<void> | null = null

async function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = migrateBriefs().catch((error) => {
      tableReady = null
      throw error
    })
  }
  return tableReady
}

async function migrateBriefs(): Promise<void> {
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS briefs (
      id               SERIAL PRIMARY KEY,
      client_name      TEXT NOT NULL,
      agent_name       TEXT NOT NULL,
      property_address TEXT NOT NULL,
      shoot_date       TEXT NOT NULL,
      agent_on_site    TEXT NOT NULL,
      gate_code        TEXT,
      lockbox_code     TEXT,
      access_notes     TEXT,
      video_types      TEXT NOT NULL DEFAULT '[]',
      video_details    TEXT NOT NULL DEFAULT '{}',
      drive_link       TEXT,
      asset_notes      TEXT,
      file_paths       TEXT NOT NULL DEFAULT '[]',
      submitted_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS client_id INTEGER`
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS client_email TEXT`
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS edited_by_client BOOLEAN NOT NULL DEFAULT FALSE`
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS previous_snapshot TEXT`
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS edit_token_hash TEXT`
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

export function mapBriefRow(row: Record<string, unknown>): BriefRow {
  return {
    id: Number(row.id),
    client_name: String(row.client_name ?? ''),
    agent_name: String(row.agent_name ?? ''),
    property_address: String(row.property_address ?? ''),
    shoot_date: String(row.shoot_date ?? ''),
    agent_on_site: String(row.agent_on_site ?? ''),
    gate_code: (row.gate_code as string | null) ?? null,
    lockbox_code: (row.lockbox_code as string | null) ?? null,
    access_notes: (row.access_notes as string | null) ?? null,
    video_types: String(row.video_types ?? '[]'),
    video_details: String(row.video_details ?? '{}'),
    drive_link: (row.drive_link as string | null) ?? null,
    asset_notes: (row.asset_notes as string | null) ?? null,
    file_paths: String(row.file_paths ?? '[]'),
    submitted_at: asIso(row.submitted_at),
    client_id: row.client_id == null ? null : Number(row.client_id),
    client_email: (row.client_email as string | null) ?? null,
    updated_at: row.updated_at == null ? null : asIso(row.updated_at),
    edited_by_client: row.edited_by_client === true || row.edited_by_client === 't' || row.edited_by_client === 'true',
    previous_snapshot: (row.previous_snapshot as string | null) ?? null,
    edit_token_hash: (row.edit_token_hash as string | null) ?? null,
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function insertBrief(data: {
  client_name: string
  agent_name: string
  property_address: string
  shoot_date: string
  agent_on_site: string
  gate_code?: string
  lockbox_code?: string
  access_notes?: string
  video_types: string[]
  video_details: Record<string, VideoDetail>
  drive_link?: string
  asset_notes?: string
  file_paths: string[]
  client_id?: number | null
  client_email?: string | null
  edit_token_hash?: string | null
}): Promise<number> {
  const created = await createBriefRecord({
    client_name: data.client_name,
    client_email: data.client_email ?? null,
    client_id: data.client_id ?? null,
    agent_name: data.agent_name,
    property_address: data.property_address,
    shoot_date: data.shoot_date,
    agent_on_site: data.agent_on_site,
    gate_code: data.gate_code ?? null,
    lockbox_code: data.lockbox_code ?? null,
    access_notes: data.access_notes ?? null,
    video_types: JSON.stringify(data.video_types),
    video_details: JSON.stringify(data.video_details),
    drive_link: data.drive_link ?? null,
    asset_notes: data.asset_notes ?? null,
    file_paths: JSON.stringify(data.file_paths),
    edit_token_hash: data.edit_token_hash ?? null,
  })
  return created.id
}

export async function createBriefRecord(data: NewBriefRecord): Promise<BriefRow> {
  await ensureTable()
  const sql = getSql()
  const rows = await sql`
    INSERT INTO briefs (
      client_name, client_email, client_id, agent_name, property_address, shoot_date,
      agent_on_site, gate_code, lockbox_code, access_notes,
      video_types, video_details, drive_link, asset_notes, file_paths, edit_token_hash
    ) VALUES (
      ${data.client_name},
      ${data.client_email},
      ${data.client_id},
      ${data.agent_name},
      ${data.property_address},
      ${data.shoot_date},
      ${data.agent_on_site},
      ${data.gate_code},
      ${data.lockbox_code},
      ${data.access_notes},
      ${data.video_types},
      ${data.video_details},
      ${data.drive_link},
      ${data.asset_notes},
      ${data.file_paths},
      ${data.edit_token_hash}
    )
    RETURNING *
  `
  return mapBriefRow(rows[0] as Record<string, unknown>)
}

export async function updateBriefRecord(id: number, patch: BriefUpdate): Promise<BriefRow | null> {
  await ensureTable()
  const sql = getSql()
  const rows = await sql`
    UPDATE briefs SET
      agent_name = ${patch.agent_name},
      property_address = ${patch.property_address},
      shoot_date = ${patch.shoot_date},
      agent_on_site = ${patch.agent_on_site},
      gate_code = ${patch.gate_code},
      lockbox_code = ${patch.lockbox_code},
      access_notes = ${patch.access_notes},
      video_types = ${patch.video_types},
      video_details = ${patch.video_details},
      drive_link = ${patch.drive_link},
      asset_notes = ${patch.asset_notes},
      previous_snapshot = ${patch.previous_snapshot},
      edited_by_client = TRUE,
      updated_at = ${patch.updated_at}
    WHERE id = ${id}
    RETURNING *
  `
  return rows[0] ? mapBriefRow(rows[0] as Record<string, unknown>) : null
}

export async function getAllBriefs(): Promise<BriefRow[]> {
  await ensureTable()
  const sql = getSql()
  const rows = await sql`SELECT * FROM briefs ORDER BY submitted_at DESC`
  return (rows as Record<string, unknown>[]).map(mapBriefRow)
}

export async function getBriefById(id: number): Promise<BriefRow | null> {
  await ensureTable()
  const sql = getSql()
  const rows = await sql`SELECT * FROM briefs WHERE id = ${id} LIMIT 1`
  return rows[0] ? mapBriefRow(rows[0] as Record<string, unknown>) : null
}

export async function listBriefsForOwner(clientId: number, email: string): Promise<BriefRow[]> {
  await ensureTable()
  const sql = getSql()
  const normalized = email.trim().toLowerCase()
  const rows = await sql`
    SELECT * FROM briefs
    WHERE client_id = ${clientId}
       OR lower(client_email) = ${normalized}
       OR lower(client_name) = ${normalized}
    ORDER BY submitted_at DESC
  `
  return (rows as Record<string, unknown>[]).map(mapBriefRow)
}

export async function getBriefByEditTokenHash(tokenHash: string): Promise<BriefRow | null> {
  await ensureTable()
  const sql = getSql()
  const rows = await sql`SELECT * FROM briefs WHERE edit_token_hash = ${tokenHash} LIMIT 1`
  return rows[0] ? mapBriefRow(rows[0] as Record<string, unknown>) : null
}
