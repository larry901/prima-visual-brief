import type { PlanSize } from '../portal/types'

export const LEAD_SOURCES = [
  'Referral',
  'Instagram DM',
  'Website form',
  'Acuity discovery call',
  'Other',
] as const

export const LEAD_STAGES = [
  'New',
  'Discovery Booked',
  'Discovery Done',
  'Proposal Sent',
  'Won',
  'Lost',
] as const

/** Stages that still need a follow-up. Won and Lost are closed. */
export const OPEN_LEAD_STAGES = ['New', 'Discovery Booked', 'Discovery Done', 'Proposal Sent'] as const

export const SERVICE_TYPES = ['subscription', 'project'] as const
export const TOUCH_KINDS = ['call', 'text', 'dm', 'email'] as const
export const DISCOVERY_STATUSES = ['scheduled', 'rescheduled', 'cancelled'] as const
export const SNOOZE_PRESETS = ['tomorrow', '3days', 'week'] as const

export type LeadSource = (typeof LEAD_SOURCES)[number]
export type LeadStage = (typeof LEAD_STAGES)[number]
export type ServiceType = (typeof SERVICE_TYPES)[number]
export type TouchKind = (typeof TOUCH_KINDS)[number]
export type DiscoveryStatus = (typeof DISCOVERY_STATUSES)[number]
export type SnoozePreset = (typeof SNOOZE_PRESETS)[number]

export function isLeadSource(value: unknown): value is LeadSource {
  return typeof value === 'string' && (LEAD_SOURCES as readonly string[]).includes(value)
}

export function isLeadStage(value: unknown): value is LeadStage {
  return typeof value === 'string' && (LEAD_STAGES as readonly string[]).includes(value)
}

export function isServiceType(value: unknown): value is ServiceType {
  return value === 'subscription' || value === 'project'
}

export function isTouchKind(value: unknown): value is TouchKind {
  return typeof value === 'string' && (TOUCH_KINDS as readonly string[]).includes(value)
}

export function isDiscoveryStatus(value: unknown): value is DiscoveryStatus {
  return value === 'scheduled' || value === 'rescheduled' || value === 'cancelled'
}

export function isSnoozePreset(value: unknown): value is SnoozePreset {
  return value === 'tomorrow' || value === '3days' || value === 'week'
}

export function isOpenStage(stage: LeadStage): boolean {
  return stage !== 'Won' && stage !== 'Lost'
}

export interface LeadRecord {
  id: number
  name: string
  company: string
  email: string
  phone: string
  source: LeadSource
  referredBy: string
  stage: LeadStage
  estimatedValueDollars: number | null
  serviceType: ServiceType | null
  notes: string
  /** Chicago calendar date (YYYY-MM-DD), or null when no follow-up is set. */
  nextFollowUp: string | null
  lostReason: string
  acuityAppointmentId: string | null
  discoveryStartAt: string | null
  discoveryStatus: DiscoveryStatus | null
  convertedClientId: number | null
  createdAt: string
  updatedAt: string
}

export interface NewLead {
  name: string
  company?: string
  email?: string
  phone?: string
  source: LeadSource
  referredBy?: string
  stage: LeadStage
  estimatedValueDollars?: number | null
  serviceType?: ServiceType | null
  notes?: string
  nextFollowUp?: string | null
  lostReason?: string
  acuityAppointmentId?: string | null
  discoveryStartAt?: string | null
  discoveryStatus?: DiscoveryStatus | null
  convertedClientId?: number | null
}

export interface LeadPatch {
  name?: string
  company?: string
  email?: string
  phone?: string
  source?: LeadSource
  referredBy?: string
  stage?: LeadStage
  estimatedValueDollars?: number | null
  serviceType?: ServiceType | null
  notes?: string
  nextFollowUp?: string | null
  lostReason?: string
  acuityAppointmentId?: string | null
  discoveryStartAt?: string | null
  discoveryStatus?: DiscoveryStatus | null
  convertedClientId?: number | null
}

export interface StageEvent {
  id: number
  leadId: number
  fromStage: LeadStage | null
  toStage: LeadStage
  at: string
}

export interface TouchRecord {
  id: number
  leadId: number
  kind: TouchKind
  note: string
  at: string
}

/** A deal logged on KPIs that never lived as a lead. Lead wins stay on the lead. */
export interface WonDealRecord {
  id: number
  name: string
  serviceType: ServiceType
  amountDollars: number
  /** Chicago calendar date the deal was won (YYYY-MM-DD). */
  wonOn: string
  createdAt: string
}

export interface NewWonDeal {
  name: string
  serviceType: ServiceType
  amountDollars: number
  wonOn: string
}

export interface NewTouch {
  leadId: number
  kind: TouchKind
  note?: string
}

export interface HubStore {
  ensureReady(): Promise<void>
  listLeads(): Promise<LeadRecord[]>
  getLead(id: number): Promise<LeadRecord | null>
  createLead(input: NewLead, now?: Date): Promise<LeadRecord>
  updateLead(id: number, patch: LeadPatch, now?: Date): Promise<LeadRecord>
  listStageEvents(leadId?: number): Promise<StageEvent[]>
  addTouch(input: NewTouch, now?: Date): Promise<TouchRecord>
  listTouches(leadId?: number): Promise<TouchRecord[]>
  listWonDeals(): Promise<WonDealRecord[]>
  createWonDeal(input: NewWonDeal, now?: Date): Promise<WonDealRecord>
  getPlanPrices(): Promise<Partial<Record<PlanSize, number>>>
  setPlanPrice(planSize: PlanSize, monthlyDollars: number | null): Promise<void>
  getClientPrices(): Promise<Map<number, number>>
  setClientPrice(clientId: number, monthlyDollars: number | null): Promise<void>
  /**
   * Drop the hub rows that point at a roster client that is about to be deleted.
   * The price row is also removed by the clients foreign key. The converted-client
   * pointer is not, so a deleted client must not keep a lead looking converted.
   */
  releaseClient(clientId: number): Promise<void>
  countRecentStaffLinks(email: string, sinceIso: string): Promise<number>
  createStaffMagicLink(email: string, tokenHash: string, expiresAt: string, now?: Date): Promise<void>
  consumeStaffMagicLink(tokenHash: string, nowIso: string): Promise<string | null>
  createStaffSession(email: string, tokenHash: string, expiresAt: string): Promise<void>
  getStaffBySession(tokenHash: string, nowIso: string): Promise<string | null>
  deleteStaffSession(tokenHash: string): Promise<void>
}
