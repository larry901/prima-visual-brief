import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import { MemoryStore, emptyMemoryData, type MemoryData } from './memory-store'
import type { PortalStore } from './types'

export function demoStorePath(): string {
  return path.join(process.cwd(), '.data', 'portal-store.json')
}

/**
 * Local-only persistence for machines without POSTGRES_URL.
 * Vercel deployments use Neon; the filesystem there is not a database.
 */
export function createFileStore(filePath: string): PortalStore {
  let chain: Promise<unknown> = Promise.resolve()

  async function load(): Promise<MemoryStore> {
    try {
      const raw = await readFile(filePath, 'utf8')
      return new MemoryStore(JSON.parse(raw) as MemoryData)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new MemoryStore(emptyMemoryData())
      throw error
    }
  }

  async function save(store: MemoryStore): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, JSON.stringify(store.data, null, 2))
  }

  function run<T>(fn: (store: MemoryStore) => Promise<T>): Promise<T> {
    const next = chain.then(async () => {
      const store = await load()
      const value = await fn(store)
      await save(store)
      return value
    })
    chain = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  return {
    ensureReady: () => run(async (store) => store.ensureReady()),
    listClients: () => run((store) => store.listClients()),
    getClient: (id) => run((store) => store.getClient(id)),
    findClientByEmail: (email) => run((store) => store.findClientByEmail(email)),
    createClient: (input) => run((store) => store.createClient(input)),
    updateClient: (id, input) => run((store) => store.updateClient(id, input)),
    updateRenewal: (id, renewalDate) => run((store) => store.updateRenewal(id, renewalDate)),
    findAppointmentByAcuityId: (id) => run((store) => store.findAppointmentByAcuityId(id)),
    findAppointmentByNaturalKey: (email, type, start) =>
      run((store) => store.findAppointmentByNaturalKey(email, type, start)),
    listOpenAppointments: (email, type) => run((store) => store.listOpenAppointments(email, type)),
    insertAppointment: (row) => run((store) => store.insertAppointment(row)),
    updateAppointment: (id, patch) => run((store) => store.updateAppointment(id, patch)),
    listAppointmentsForClient: (clientId) => run((store) => store.listAppointmentsForClient(clientId)),
    listNeedsReview: () => run((store) => store.listNeedsReview()),
    dismissReview: (id) => run((store) => store.dismissReview(id)),
    attachUnmatched: (email, clientId) => run((store) => store.attachUnmatched(email, clientId)),
    getCountedTypes: () => run((store) => store.getCountedTypes()),
    setCountedTypes: (types) => run((store) => store.setCountedTypes(types)),
    countRecentMagicLinks: (clientId, sinceIso) => run((store) => store.countRecentMagicLinks(clientId, sinceIso)),
    createMagicLink: (clientId, tokenHash, expiresAt) =>
      run((store) => store.createMagicLink(clientId, tokenHash, expiresAt)),
    consumeMagicLink: (tokenHash, nowIso) => run((store) => store.consumeMagicLink(tokenHash, nowIso)),
    createSession: (clientId, tokenHash, expiresAt) =>
      run((store) => store.createSession(clientId, tokenHash, expiresAt)),
    getClientBySession: (tokenHash, nowIso) => run((store) => store.getClientBySession(tokenHash, nowIso)),
    deleteSession: (tokenHash) => run((store) => store.deleteSession(tokenHash)),
    findBriefShootDates: (name, email) => run((store) => store.findBriefShootDates(name, email)),
    listAllBriefs: () => run((store) => store.listAllBriefs()),
    getBriefById: (id) => run((store) => store.getBriefById(id)),
    listBriefsForClient: (clientId, email) => run((store) => store.listBriefsForClient(clientId, email)),
    getBriefByEditTokenHash: (tokenHash) => run((store) => store.getBriefByEditTokenHash(tokenHash)),
    createBriefRecord: (row) => run((store) => store.createBriefRecord(row)),
    updateBriefRecord: (id, patch) => run((store) => store.updateBriefRecord(id, patch)),
  }
}
