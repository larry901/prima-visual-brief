import type { BriefRow, BriefUpdate, NewBriefRecord } from '../db'
import { readFrameioUrl } from './clients'
import { DEFAULT_COUNTED_TYPES } from './cycle'
import { clientOwnsBrief } from '../brief-logic'
import { normalizeEmail } from './ingest'
import type {
  AppointmentPatch,
  AppointmentRecord,
  ClientInput,
  ClientRecord,
  NewAppointment,
  PortalStore,
} from './types'

interface MagicLinkRow {
  id: number
  clientId: number
  tokenHash: string
  expiresAt: string
  usedAt: string | null
  createdAt: string
}

interface SessionRow {
  tokenHash: string
  clientId: number
  expiresAt: string
}

export interface MemoryData {
  clients: ClientRecord[]
  appointments: AppointmentRecord[]
  magicLinks: MagicLinkRow[]
  sessions: SessionRow[]
  countedTypes: string[]
  briefShootDates: { name: string; email: string; shootDate: string }[]
  briefs: BriefRow[]
  seq: { client: number; appointment: number; magic: number; brief: number }
}

export function emptyMemoryData(): MemoryData {
  return {
    clients: [],
    appointments: [],
    magicLinks: [],
    sessions: [],
    countedTypes: [...DEFAULT_COUNTED_TYPES],
    briefShootDates: [],
    briefs: [],
    seq: { client: 1, appointment: 1, magic: 1, brief: 1 },
  }
}

function planFields(input: ClientInput, existing: ClientRecord | null) {
  if (input.kind === 'project') {
    return { planSize: null, renewalDate: null, billingAnchorDay: null }
  }
  const renewalDate = input.renewalDate
  const anchor =
    existing && existing.renewalDate === renewalDate && existing.billingAnchorDay
      ? existing.billingAnchorDay
      : renewalDate
        ? Number(renewalDate.slice(8, 10))
        : null
  return { planSize: input.planSize, renewalDate, billingAnchorDay: anchor }
}

function sameInstant(a: string, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime()
}

function sameType(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export class MemoryStore implements PortalStore {
  data: MemoryData

  constructor(data: MemoryData = emptyMemoryData()) {
    this.data = data
    for (const client of this.data.clients) {
      const legacy = client as ClientRecord & { frameioLinks?: unknown }
      if (!client.kind) client.kind = 'subscription'
      if (client.schedulingLink === undefined) client.schedulingLink = null
      if (!client.frameioUrl) client.frameioUrl = readFrameioUrl(legacy.frameioLinks)
    }
    if (!this.data.briefs) this.data.briefs = []
    if (!this.data.seq.brief) this.data.seq.brief = 1
  }

  async ensureReady(): Promise<void> {}

  async listClients(): Promise<ClientRecord[]> {
    return [...this.data.clients].sort((a, b) => a.name.localeCompare(b.name))
  }

  async getClient(id: number): Promise<ClientRecord | null> {
    return this.data.clients.find((client) => client.id === id) ?? null
  }

  async findClientByEmail(email: string): Promise<ClientRecord | null> {
    const norm = normalizeEmail(email)
    return this.data.clients.find((client) => client.email === norm) ?? null
  }

  async createClient(input: ClientInput): Promise<ClientRecord> {
    if (await this.findClientByEmail(input.email)) {
      throw new Error('A client with that email already exists')
    }
    const plan = planFields(input, null)
    const client: ClientRecord = {
      id: this.data.seq.client++,
      name: input.name,
      email: normalizeEmail(input.email),
      company: input.company,
      kind: input.kind,
      planSize: plan.planSize,
      renewalDate: plan.renewalDate,
      billingAnchorDay: plan.billingAnchorDay,
      schedulingLink: input.schedulingLink,
      frameioUrl: input.frameioUrl,
      active: input.active,
    }
    this.data.clients.push(client)
    return client
  }

  async updateClient(id: number, input: ClientInput): Promise<ClientRecord> {
    const client = await this.getClient(id)
    if (!client) throw new Error('Client not found')
    const email = normalizeEmail(input.email)
    const clash = this.data.clients.find((other) => other.email === email && other.id !== id)
    if (clash) throw new Error('A client with that email already exists')
    const plan = planFields(input, client)
    client.name = input.name
    client.email = email
    client.company = input.company
    client.kind = input.kind
    client.planSize = plan.planSize
    client.renewalDate = plan.renewalDate
    client.billingAnchorDay = plan.billingAnchorDay
    client.schedulingLink = input.schedulingLink
    client.frameioUrl = input.frameioUrl
    client.active = input.active
    return client
  }

  async updateRenewal(id: number, renewalDate: string): Promise<void> {
    const client = await this.getClient(id)
    if (!client) throw new Error('Client not found')
    client.renewalDate = renewalDate
  }

  async findAppointmentByAcuityId(acuityId: string): Promise<AppointmentRecord | null> {
    return this.data.appointments.find((row) => row.acuityAppointmentId === acuityId) ?? null
  }

  async findAppointmentByNaturalKey(email: string, appointmentType: string, startAt: string): Promise<AppointmentRecord | null> {
    const norm = normalizeEmail(email)
    return (
      this.data.appointments.find(
        (row) =>
          row.clientEmail === norm &&
          sameType(row.appointmentType, appointmentType) &&
          sameInstant(row.startAt, startAt),
      ) ?? null
    )
  }

  async listOpenAppointments(email: string, appointmentType: string): Promise<AppointmentRecord[]> {
    const norm = normalizeEmail(email)
    return this.data.appointments.filter(
      (row) =>
        row.clientEmail === norm &&
        sameType(row.appointmentType, appointmentType) &&
        !row.needsReview &&
        (row.status === 'scheduled' || row.status === 'rescheduled'),
    )
  }

  async insertAppointment(row: NewAppointment): Promise<AppointmentRecord> {
    const appointment: AppointmentRecord = { id: this.data.seq.appointment++, ...row }
    this.data.appointments.push(appointment)
    return appointment
  }

  async updateAppointment(id: number, patch: AppointmentPatch): Promise<AppointmentRecord> {
    const row = this.data.appointments.find((appointment) => appointment.id === id)
    if (!row) throw new Error('Appointment not found')
    Object.assign(row, patch)
    return row
  }

  async listAppointmentsForClient(clientId: number): Promise<AppointmentRecord[]> {
    return this.data.appointments
      .filter((row) => row.clientId === clientId)
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
  }

  async listNeedsReview(): Promise<AppointmentRecord[]> {
    return this.data.appointments
      .filter((row) => row.needsReview)
      .sort((a, b) => b.id - a.id)
  }

  async dismissReview(id: number): Promise<boolean> {
    const index = this.data.appointments.findIndex((row) => row.id === id && row.needsReview)
    if (index === -1) return false
    this.data.appointments.splice(index, 1)
    return true
  }

  async attachUnmatched(email: string, clientId: number): Promise<void> {
    const norm = normalizeEmail(email)
    for (const row of this.data.appointments) {
      if (row.clientEmail !== norm) continue
      if (row.clientId != null && row.clientId !== clientId) continue
      row.clientId = clientId
      if (row.reviewReason === 'unmatched_client') {
        row.needsReview = false
        row.reviewReason = null
      }
    }
  }

  async getCountedTypes(): Promise<string[]> {
    return [...this.data.countedTypes]
  }

  async setCountedTypes(types: string[]): Promise<void> {
    this.data.countedTypes = [...types]
  }

  async countRecentMagicLinks(clientId: number, sinceIso: string): Promise<number> {
    const since = new Date(sinceIso).getTime()
    return this.data.magicLinks.filter(
      (link) => link.clientId === clientId && new Date(link.createdAt).getTime() >= since,
    ).length
  }

  async createMagicLink(clientId: number, tokenHash: string, expiresAt: string): Promise<void> {
    this.data.magicLinks.push({
      id: this.data.seq.magic++,
      clientId,
      tokenHash,
      expiresAt,
      usedAt: null,
      createdAt: new Date().toISOString(),
    })
  }

  async consumeMagicLink(tokenHash: string, nowIso: string): Promise<ClientRecord | null> {
    const link = this.data.magicLinks.find((row) => row.tokenHash === tokenHash)
    if (!link || link.usedAt) return null
    if (new Date(link.expiresAt).getTime() <= new Date(nowIso).getTime()) return null
    link.usedAt = nowIso
    const client = await this.getClient(link.clientId)
    if (!client?.active) return null
    return client
  }

  async createSession(clientId: number, tokenHash: string, expiresAt: string): Promise<void> {
    this.data.sessions = this.data.sessions.filter((session) => session.tokenHash !== tokenHash)
    this.data.sessions.push({ tokenHash, clientId, expiresAt })
  }

  async getClientBySession(tokenHash: string, nowIso: string): Promise<ClientRecord | null> {
    const session = this.data.sessions.find((row) => row.tokenHash === tokenHash)
    if (!session) return null
    if (new Date(session.expiresAt).getTime() <= new Date(nowIso).getTime()) return null
    const client = await this.getClient(session.clientId)
    if (!client?.active) return null
    return client
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.data.sessions = this.data.sessions.filter((session) => session.tokenHash !== tokenHash)
  }

  async findBriefShootDates(name: string, email: string): Promise<string[]> {
    const nameKey = name.trim().toLowerCase()
    const emailKey = normalizeEmail(email)
    const legacy = this.data.briefShootDates
      .filter((brief) => brief.name.trim().toLowerCase() === nameKey || brief.email.trim().toLowerCase() === emailKey)
      .map((brief) => brief.shootDate.slice(0, 10))
    const owned = this.data.briefs
      .filter((brief) => clientOwnsBrief(brief, { id: -1, email: emailKey }) || (brief.client_email || '').toLowerCase() === emailKey)
      .map((brief) => brief.shoot_date.slice(0, 10))
    return Array.from(new Set([...legacy, ...owned]))
  }

  async listAllBriefs(): Promise<BriefRow[]> {
    return [...this.data.briefs].sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
  }

  async getBriefById(id: number): Promise<BriefRow | null> {
    return this.data.briefs.find((brief) => brief.id === id) ?? null
  }

  async listBriefsForClient(clientId: number, email: string): Promise<BriefRow[]> {
    return (await this.listAllBriefs()).filter((brief) => clientOwnsBrief(brief, { id: clientId, email }))
  }

  async getBriefByEditTokenHash(tokenHash: string): Promise<BriefRow | null> {
    return this.data.briefs.find((brief) => brief.edit_token_hash === tokenHash) ?? null
  }

  async createBriefRecord(row: NewBriefRecord): Promise<BriefRow> {
    const brief: BriefRow = {
      id: this.data.seq.brief++,
      client_name: row.client_name,
      client_email: row.client_email,
      client_id: row.client_id,
      agent_name: row.agent_name,
      property_address: row.property_address,
      shoot_date: row.shoot_date,
      agent_on_site: row.agent_on_site,
      gate_code: row.gate_code,
      lockbox_code: row.lockbox_code,
      access_notes: row.access_notes,
      video_types: row.video_types,
      video_details: row.video_details,
      drive_link: row.drive_link,
      asset_notes: row.asset_notes,
      file_paths: row.file_paths,
      submitted_at: new Date().toISOString(),
      updated_at: null,
      edited_by_client: false,
      previous_snapshot: null,
      edit_token_hash: row.edit_token_hash,
    }
    this.data.briefs.push(brief)
    return brief
  }

  async updateBriefRecord(id: number, patch: BriefUpdate): Promise<BriefRow> {
    const brief = await this.getBriefById(id)
    if (!brief) throw new Error('Brief not found')
    brief.agent_name = patch.agent_name
    brief.property_address = patch.property_address
    brief.shoot_date = patch.shoot_date
    brief.agent_on_site = patch.agent_on_site
    brief.gate_code = patch.gate_code
    brief.lockbox_code = patch.lockbox_code
    brief.access_notes = patch.access_notes
    brief.video_types = patch.video_types
    brief.video_details = patch.video_details
    brief.drive_link = patch.drive_link
    brief.asset_notes = patch.asset_notes
    brief.previous_snapshot = patch.previous_snapshot
    brief.edited_by_client = true
    brief.updated_at = patch.updated_at
    return brief
  }
}
