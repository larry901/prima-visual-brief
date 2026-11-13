import { portalStoreMode } from '../portal/store'
import { createFileHubStore, hubStorePath } from './file-store'
import { createNeonHubStore } from './neon-store'
import type { HubStore } from './types'

let singleton: HubStore | null = null

export function getHubStore(): HubStore {
  if (singleton) return singleton
  singleton = portalStoreMode() === 'neon' ? createNeonHubStore() : createFileHubStore(hubStorePath())
  return singleton
}
