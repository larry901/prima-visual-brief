import { createFileStore, demoStorePath } from './file-store'
import { createNeonStore } from './neon-store'
import type { PortalStore } from './types'

let singleton: PortalStore | null = null

export function portalStoreMode(): 'neon' | 'file' {
  if (process.env.POSTGRES_URL) return 'neon'
  if (process.env.VERCEL) {
    throw new Error('POSTGRES_URL is not set. The client portal uses the same Neon database as the brief form.')
  }
  return 'file'
}

export function getPortalStore(): PortalStore {
  if (singleton) return singleton
  singleton = portalStoreMode() === 'neon' ? createNeonStore() : createFileStore(demoStorePath())
  return singleton
}
