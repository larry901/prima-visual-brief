import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'prima-brief.db')

let db: Database.Database

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initSchema(db)
  }
  return db
}

function initSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS briefs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      property_address TEXT NOT NULL,
      shoot_date TEXT NOT NULL,
      agent_on_site TEXT NOT NULL,
      gate_code TEXT,
      lockbox_code TEXT,
      access_notes TEXT,
      video_types TEXT NOT NULL DEFAULT '[]',
      video_details TEXT NOT NULL DEFAULT '{}',
      drive_link TEXT,
      asset_notes TEXT,
      file_paths TEXT NOT NULL DEFAULT '[]',
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

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

export function insertBrief(data: {
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
}): number {
  const database = getDb()
  const stmt = database.prepare(`
    INSERT INTO briefs (
      client_name, agent_name, property_address, shoot_date,
      agent_on_site, gate_code, lockbox_code, access_notes,
      video_types, video_details, drive_link, asset_notes, file_paths
    ) VALUES (
      @client_name, @agent_name, @property_address, @shoot_date,
      @agent_on_site, @gate_code, @lockbox_code, @access_notes,
      @video_types, @video_details, @drive_link, @asset_notes, @file_paths
    )
  `)
  const result = stmt.run({
    ...data,
    gate_code: data.gate_code ?? null,
    lockbox_code: data.lockbox_code ?? null,
    access_notes: data.access_notes ?? null,
    drive_link: data.drive_link ?? null,
    asset_notes: data.asset_notes ?? null,
    video_types: JSON.stringify(data.video_types),
    video_details: JSON.stringify(data.video_details),
    file_paths: JSON.stringify(data.file_paths),
  })
  return result.lastInsertRowid as number
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

export function getAllBriefs(): BriefRow[] {
  const database = getDb()
  return database.prepare('SELECT * FROM briefs ORDER BY submitted_at DESC').all() as BriefRow[]
}

export function getBriefById(id: number): BriefRow | null {
  const database = getDb()
  return database.prepare('SELECT * FROM briefs WHERE id = ?').get(id) as BriefRow | null
}
