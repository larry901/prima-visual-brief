import { normalizeEmail } from '../portal/email'
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
  type NewLead,
  type NewTouch,
  type StageEvent,
  type TouchRecord,
} from './types'

interface MagicLinkRow {
  id: number
  email: string
  tokenHash: string
  expiresAt: string
  usedAt: string | null
  createdAt: string
}

interface SessionRow {
  tokenHash: string
  email: string
  expiresAt: string
}

export interface MemoryHubData {
  leads: LeadRecord[]
  events: StageEvent[]
  touches: TouchRecord[]
  planPrices: Partial<Record<PlanSize, number>>
  clientPrices: [number, number][]
  magicLinks: MagicLinkRow[]
  sessions: SessionRow[]
  seq: { lead: number; event: number; touch: number; magic: number }
}

export function emptyHubData(): MemoryHubData {
  return {
    leads: [],
    events: [],
    touches: [],
    planPrices: {},
    clientPrices: [],
    magicLinks: [],
    sessions: [],
    seq: { lead: 1, event: 1, touch: 1, magic: 1 },
  }
}

function dollars(value: number | null | undefined): number | null {
  if (value == null) return null
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw new Error('Amount must be a whole dollar value from 0 to 1,000,000')
  }
  return value
}

function applyPatch(lead: LeadRecord, patch: LeadPatch): void {
  if (patch.name !== undefined) lead.name = patch.name.trim()
  if (patch.company !== undefined) lead.company = patch.company.trim()
  if (patch.email !== undefined) lead.email = patch.email ? normalizeEmail(patch.email) : ''
  if (patch.phone !== undefined) lead.phone = patch.phone.trim()
  if (patch.source !== undefined) lead.source = patch.source
  if (patch.referredBy !== undefined) lead.referredBy = patch.referredBy.trim()
  if (patch.stage !== undefined) lead.stage = patch.stage
  if (patch.estimatedValueDollars !== undefined) lead.estimatedValueDollars = dollars(patch.estimatedValueDollars)
  if (patch.serviceType !== undefined) lead.serviceType = patch.serviceType
  if (patch.notes !== undefined) lead.notes = patch.notes
  if (patch.nextFollowUp !== undefined) lead.nextFollowUp = patch.nextFollowUp
  if (patch.lostReason !== undefined) lead.lostReason = patch.lostReason.trim()
  if (patch.acuityAppointmentId !== undefined) lead.acuityAppointmentId = patch.acuityAppointmentId
  if (patch.discoveryStartAt !== undefined) lead.discoveryStartAt = patch.discoveryStartAt
  if (patch.discoveryStatus !== undefined) lead.discoveryStatus = patch.discoveryStatus
  if (patch.convertedClientId !== undefined) lead.convertedClientId = patch.convertedClientId
}

export class MemoryHubStore implements HubStore {
  data: MemoryHubData

  constructor(data: MemoryHubData = emptyHubData()) {
    this.data = data
    if (!this.data.seq) this.data.seq = { lead: 1, event: 1, touch: 1, magic: 1 }
    this.data.leads = (this.data.leads ?? []).map((lead) => ({
      ...lead,
      source: isLeadSource(lead.source) ? lead.source : 'Other',
      stage: isLeadStage(lead.stage) ? lead.stage : 'New',
      serviceType: isServiceType(lead.serviceType) ? lead.serviceType : null,
      discoveryStatus: isDiscoveryStatus(lead.discoveryStatus) ? lead.discoveryStatus : null,
    }))
    if (!Array.isArray(this.data.events)) this.data.events = []
    if (!Array.isArray(this.data.touches)) this.data.touches = []
    if (!Array.isArray(this.data.clientPrices)) this.data.clientPrices = []
    if (!this.data.planPrices) this.data.planPrices = {}
    if (!Array.isArray(this.data.magicLinks)) this.data.magicLinks = []
    if (!Array.isArray(this.data.sessions)) this.data.sessions = []
  }

  async ensureReady(): Promise<void> {}

  async listLeads(): Promise<LeadRecord[]> {
    return [...this.data.leads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id)
  }

  async getLead(id: number): Promise<LeadRecord | null> {
    return this.data.leads.find((lead) => lead.id === id) ?? null
  }

  async createLead(input: NewLead, now: Date = new Date()): Promise<LeadRecord> {
    const name = input.name.trim()
    if (!name) throw new Error('name is required')
    if (!isLeadSource(input.source) || !isLeadStage(input.stage)) throw new Error('Invalid lead')
    const nowIso = now.toISOString()
    const lead: LeadRecord = {
      id: this.data.seq.lead++,
      name,
      company: input.company?.trim() ?? '',
      email: input.email ? normalizeEmail(input.email) : '',
      phone: input.phone?.trim() ?? '',
      source: input.source,
      referredBy: input.referredBy?.trim() ?? '',
      stage: input.stage,
      estimatedValueDollars: dollars(input.estimatedValueDollars),
      serviceType: input.serviceType ?? null,
      notes: input.notes ?? '',
      nextFollowUp: input.nextFollowUp ?? null,
      lostReason: input.lostReason?.trim() ?? '',
      acuityAppointmentId: input.acuityAppointmentId ?? null,
      discoveryStartAt: input.discoveryStartAt ?? null,
      discoveryStatus: input.discoveryStatus ?? null,
      convertedClientId: input.convertedClientId ?? null,
      createdAt: nowIso,
      updatedAt: nowIso,
    }
    this.data.leads.push(lead)
    this.data.events.push({
      id: this.data.seq.event++,
      leadId: lead.id,
      fromStage: null,
      toStage: lead.stage,
      at: nowIso,
    })
    return lead
  }

  async updateLead(id: number, patch: LeadPatch, now: Date = new Date()): Promise<LeadRecord> {
    const lead = this.data.leads.find((row) => row.id === id)
    if (!lead) throw new Error('Lead not found')
    const previous = lead.stage
    applyPatch(lead, patch)
    if (!lead.name.trim()) throw new Error('name is required')
    const nowIso = now.toISOString()
    lead.updatedAt = nowIso
    if (lead.stage !== previous) {
      this.data.events.push({
        id: this.data.seq.event++,
        leadId: lead.id,
        fromStage: previous,
        toStage: lead.stage,
        at: nowIso,
      })
    }
    return lead
  }

  async listStageEvents(leadId?: number): Promise<StageEvent[]> {
    return this.data.events
      .filter((event) => leadId == null || event.leadId === leadId)
      .sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id)
  }

  async addTouch(input: NewTouch, now: Date = new Date()): Promise<TouchRecord> {
    const lead = await this.getLead(input.leadId)
    if (!lead) throw new Error('Lead not found')
    if (!isTouchKind(input.kind)) throw new Error('Unknown touch')
    const touch: TouchRecord = {
      id: this.data.seq.touch++,
      leadId: input.leadId,
      kind: input.kind,
      note: input.note?.trim() ?? '',
      at: now.toISOString(),
    }
    this.data.touches.push(touch)
    return touch
  }

  async listTouches(leadId?: number): Promise<TouchRecord[]> {
    return this.data.touches
      .filter((touch) => leadId == null || touch.leadId === leadId)
      .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id)
  }

  async getPlanPrices(): Promise<Partial<Record<PlanSize, number>>> {
    return { ...this.data.planPrices }
  }

  async setPlanPrice(planSize: PlanSize, monthlyDollars: number | null): Promise<void> {
    if (!isPlanSize(planSize)) throw new Error('Plan must be 1, 2, or 4')
    if (monthlyDollars == null) {
      delete this.data.planPrices[planSize]
      return
    }
    this.data.planPrices[planSize] = dollars(monthlyDollars) ?? 0
  }

  async getClientPrices(): Promise<Map<number, number>> {
    return new Map(this.data.clientPrices)
  }

  async setClientPrice(clientId: number, monthlyDollars: number | null): Promise<void> {
    this.data.clientPrices = this.data.clientPrices.filter(([id]) => id !== clientId)
    if (monthlyDollars == null) return
    this.data.clientPrices.push([clientId, dollars(monthlyDollars) ?? 0])
  }

  async countRecentStaffLinks(email: string, sinceIso: string): Promise<number> {
    const norm = normalizeEmail(email)
    const since = new Date(sinceIso).getTime()
    return this.data.magicLinks.filter(
      (link) => link.email === norm && new Date(link.createdAt).getTime() >= since,
    ).length
  }

  async createStaffMagicLink(email: string, tokenHash: string, expiresAt: string, now: Date = new Date()): Promise<void> {
    this.data.magicLinks.push({
      id: this.data.seq.magic++,
      email: normalizeEmail(email),
      tokenHash,
      expiresAt,
      usedAt: null,
      createdAt: now.toISOString(),
    })
  }

  async consumeStaffMagicLink(tokenHash: string, nowIso: string): Promise<string | null> {
    const link = this.data.magicLinks.find((row) => row.tokenHash === tokenHash)
    if (!link || link.usedAt) return null
    if (new Date(link.expiresAt).getTime() <= new Date(nowIso).getTime()) return null
    link.usedAt = nowIso
    return link.email
  }

  async createStaffSession(email: string, tokenHash: string, expiresAt: string): Promise<void> {
    this.data.sessions = this.data.sessions.filter((session) => session.tokenHash !== tokenHash)
    this.data.sessions.push({ tokenHash, email: normalizeEmail(email), expiresAt })
  }

  async getStaffBySession(tokenHash: string, nowIso: string): Promise<string | null> {
    const session = this.data.sessions.find((row) => row.tokenHash === tokenHash)
    if (!session) return null
    if (new Date(session.expiresAt).getTime() <= new Date(nowIso).getTime()) return null
    return session.email
  }

  async deleteStaffSession(tokenHash: string): Promise<void> {
    this.data.sessions = this.data.sessions.filter((session) => session.tokenHash !== tokenHash)
  }
}
