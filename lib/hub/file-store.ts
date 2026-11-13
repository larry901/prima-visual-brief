import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import type { HubStore } from './types'
import { MemoryHubStore, emptyHubData, type MemoryHubData } from './memory-store'

export function hubStorePath(): string {
  return path.join(process.cwd(), '.data', 'hub-store.json')
}

/** Local-only hub persistence when POSTGRES_URL is unset. Vercel uses Neon. */
export function createFileHubStore(filePath: string): HubStore {
  let chain: Promise<unknown> = Promise.resolve()

  async function load(): Promise<MemoryHubStore> {
    try {
      const raw = await readFile(filePath, 'utf8')
      return new MemoryHubStore(JSON.parse(raw) as MemoryHubData)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new MemoryHubStore(emptyHubData())
      throw error
    }
  }

  async function save(store: MemoryHubStore): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, JSON.stringify(store.data, null, 2))
  }

  function run<T>(fn: (store: MemoryHubStore) => Promise<T>): Promise<T> {
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
    listLeads: () => run((store) => store.listLeads()),
    getLead: (id) => run((store) => store.getLead(id)),
    createLead: (input, now) => run((store) => store.createLead(input, now)),
    updateLead: (id, patch, now) => run((store) => store.updateLead(id, patch, now)),
    listStageEvents: (leadId) => run((store) => store.listStageEvents(leadId)),
    addTouch: (input, now) => run((store) => store.addTouch(input, now)),
    listTouches: (leadId) => run((store) => store.listTouches(leadId)),
    listWonDeals: () => run((store) => store.listWonDeals()),
    createWonDeal: (input, now) => run((store) => store.createWonDeal(input, now)),
    getPlanPrices: () => run((store) => store.getPlanPrices()),
    setPlanPrice: (planSize, monthlyDollars) => run((store) => store.setPlanPrice(planSize, monthlyDollars)),
    getClientPrices: () => run((store) => store.getClientPrices()),
    setClientPrice: (clientId, monthlyDollars) => run((store) => store.setClientPrice(clientId, monthlyDollars)),
    releaseClient: (clientId) => run((store) => store.releaseClient(clientId)),
    countRecentStaffLinks: (email, sinceIso) => run((store) => store.countRecentStaffLinks(email, sinceIso)),
    createStaffMagicLink: (email, tokenHash, expiresAt, now) =>
      run((store) => store.createStaffMagicLink(email, tokenHash, expiresAt, now)),
    consumeStaffMagicLink: (tokenHash, nowIso) => run((store) => store.consumeStaffMagicLink(tokenHash, nowIso)),
    createStaffSession: (email, tokenHash, expiresAt) =>
      run((store) => store.createStaffSession(email, tokenHash, expiresAt)),
    getStaffBySession: (tokenHash, nowIso) => run((store) => store.getStaffBySession(tokenHash, nowIso)),
    deleteStaffSession: (tokenHash) => run((store) => store.deleteStaffSession(tokenHash)),
  }
}
