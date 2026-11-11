export type PlanSize = 2 | 4
export type ClientKind = 'subscription' | 'project'
export type AppointmentStatus = 'scheduled' | 'rescheduled' | 'cancelled'
export type IngestEventName = 'new' | 'rescheduled' | 'cancelled'

export interface FrameLink {
  label: string
  url: string
}

export interface ClientRecord {
  id: number
  name: string
  email: string
  company: string
  kind: ClientKind
  planSize: PlanSize | null
  renewalDate: string | null
  billingAnchorDay: number | null
  schedulingLink: string | null
  frameioLinks: FrameLink[]
  active: boolean
}

export interface ClientInput {
  name: string
  email: string
  company: string
  kind: ClientKind
  planSize: PlanSize | null
  renewalDate: string | null
  schedulingLink: string | null
  frameioLinks: FrameLink[]
  active: boolean
}

export interface AppointmentRecord {
  id: number
  clientId: number | null
  acuityAppointmentId: string | null
  appointmentType: string
  startAt: string
  status: AppointmentStatus
  source: string
  clientEmail: string
  clientName: string
  rawSubject: string | null
  needsReview: boolean
  reviewReason: string | null
}

export interface NewAppointment {
  clientId: number | null
  acuityAppointmentId: string | null
  appointmentType: string
  startAt: string
  status: AppointmentStatus
  source: string
  clientEmail: string
  clientName: string
  rawSubject: string | null
  needsReview: boolean
  reviewReason: string | null
}

export interface AppointmentPatch {
  clientId?: number | null
  appointmentType?: string
  startAt?: string
  status?: AppointmentStatus
  clientEmail?: string
  clientName?: string
  rawSubject?: string | null
  needsReview?: boolean
  reviewReason?: string | null
}

export interface IngestStore {
  findClientByEmail(email: string): Promise<ClientRecord | null>
  findAppointmentByAcuityId(acuityId: string): Promise<AppointmentRecord | null>
  findAppointmentByNaturalKey(
    email: string,
    appointmentType: string,
    startAt: string,
  ): Promise<AppointmentRecord | null>
  listOpenAppointments(email: string, appointmentType: string): Promise<AppointmentRecord[]>
  insertAppointment(row: NewAppointment): Promise<AppointmentRecord>
  updateAppointment(id: number, patch: AppointmentPatch): Promise<AppointmentRecord>
}

export interface PortalStore extends IngestStore {
  ensureReady(): Promise<void>
  listClients(): Promise<ClientRecord[]>
  getClient(id: number): Promise<ClientRecord | null>
  createClient(input: ClientInput): Promise<ClientRecord>
  updateClient(id: number, input: ClientInput): Promise<ClientRecord>
  updateRenewal(id: number, renewalDate: string): Promise<void>
  listAppointmentsForClient(clientId: number): Promise<AppointmentRecord[]>
  listNeedsReview(): Promise<AppointmentRecord[]>
  dismissReview(id: number): Promise<boolean>
  attachUnmatched(email: string, clientId: number): Promise<void>
  getCountedTypes(): Promise<string[]>
  setCountedTypes(types: string[]): Promise<void>
  countRecentMagicLinks(clientId: number, sinceIso: string): Promise<number>
  createMagicLink(clientId: number, tokenHash: string, expiresAt: string): Promise<void>
  consumeMagicLink(tokenHash: string, nowIso: string): Promise<ClientRecord | null>
  createSession(clientId: number, tokenHash: string, expiresAt: string): Promise<void>
  getClientBySession(tokenHash: string, nowIso: string): Promise<ClientRecord | null>
  deleteSession(tokenHash: string): Promise<void>
  findBriefShootDates(name: string, email: string): Promise<string[]>
}
