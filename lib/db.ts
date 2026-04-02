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

export interface VideoDetail {
  highlights: string
  avoid: string
  musicVibes: string[]
  referenceArtist: string
  inspirationLinks: string[]
  inspirationThoughts: string
  script: string
  toneOfVoice: string
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
}

// ---------------------------------------------------------------------------
// Schema bootstrap — idempotent, called before every query
// ---------------------------------------------------------------------------

async function ensureTable(): Promise<void> {
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
}): Promise<number> {
  await ensureTable()
  const sql = getSql()

  const videoTypesJson = JSON.stringify(data.video_types)
  const videoDetailsJson = JSON.stringify(data.video_details)
  const filePathsJson = JSON.stringify(data.file_paths)

  const rows = await sql`
    INSERT INTO briefs (
      client_name, agent_name, property_address, shoot_date,
      agent_on_site, gate_code, lockbox_code, access_notes,
      video_types, video_details, drive_link, asset_notes, file_paths
    ) VALUES (
      ${data.client_name},
      ${data.agent_name},
      ${data.property_address},
      ${data.shoot_date},
      ${data.agent_on_site},
      ${data.gate_code ?? null},
      ${data.lockbox_code ?? null},
      ${data.access_notes ?? null},
      ${videoTypesJson},
      ${videoDetailsJson},
      ${data.drive_link ?? null},
      ${data.asset_notes ?? null},
      ${filePathsJson}
    )
    RETURNING id
  `

  return (rows[0] as { id: number }).id
}

export async function getAllBriefs(): Promise<BriefRow[]> {
  await ensureTable()
  const sql = getSql()
  const rows = await sql`SELECT * FROM briefs ORDER BY submitted_at DESC`
  return rows as BriefRow[]
}

export async function getBriefById(id: number): Promise<BriefRow | null> {
  await ensureTable()
  const sql = getSql()
  const rows = await sql`SELECT * FROM briefs WHERE id = ${id} LIMIT 1`
  return (rows[0] as BriefRow) ?? null
}
