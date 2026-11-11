import { readFileSync } from 'fs'
import { getPortalStore } from '../lib/portal/store'
import { seedDemoRoster } from '../lib/portal/seed'

function loadLocalEnv() {
  try {
    const text = readFileSync('.env.local', 'utf8')
    for (const line of text.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!match || process.env[match[1]]) continue
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
    }
  } catch {
    // Next.js loads .env.local itself; this script only needs it when run directly.
  }
}

loadLocalEnv()

seedDemoRoster(getPortalStore())
  .then(() => {
    console.log('Seeded fictional example.com clients.')
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
