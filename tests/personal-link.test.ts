import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ClientInput } from '../lib/portal/types'
import { MemoryStore } from '../lib/portal/memory-store'
import {
  PERSONAL_LINK_DAY_MAX,
  PERSONAL_LINK_DAY_WINDOW_MS,
  PERSONAL_LINK_MISMATCH,
  PERSONAL_LINK_SHORT_MAX,
  PERSONAL_LINK_SHORT_WINDOW_MS,
  PERSONAL_LINK_THROTTLED,
  PERSONAL_LINK_UNAVAILABLE,
  emailMatchesClient,
  ensurePersonalLink,
  openPersonalToken,
  personalLinkStatus,
  personalLinkUrl,
  redeemPersonalLink,
  resetPersonalLink,
  sealPersonalToken,
} from '../lib/portal/personal-link'
import { hashToken, magicLinkExpiry, newToken, sessionExpiry } from '../lib/portal/tokens'

const NOW = new Date('2026-11-12T18:00:00.000Z')
const SECRET = 'test-dashboard-password'
const DAY_MS = 24 * 60 * 60 * 1000

function sample(overrides: Partial<ClientInput> = {}): ClientInput {
  return {
    name: 'Casey Example',
    email: 'casey.example@example.com',
    additionalEmails: ['sam.example@example.com'],
    company: 'Example Realty',
    kind: 'subscription',
    planSize: 2,
    renewalDate: '2026-12-01',
    schedulingLink: null,
    frameioUrl: null,
    active: true,
    ...overrides,
  }
}

async function setup(overrides: Partial<ClientInput> = {}) {
  const store = new MemoryStore()
  const client = await store.createClient(sample(overrides))
  const token = await ensurePersonalLink(store, client.id, SECRET)
  return { store, client, token }
}

function assertGeneric(error: string) {
  assert.equal(error.includes('@'), false)
  assert.equal(error.toLowerCase().includes('casey.example'), false)
  assert.equal(error.toLowerCase().includes('sam.example'), false)
  assert.equal(error.toLowerCase().includes('other.example'), false)
}

describe('personal portal links', () => {
  describe('token', () => {
    it('stores a high-entropy random token as a hash, not the raw value', async () => {
      const { store, client, token } = await setup()
      assert.equal(Buffer.from(token, 'base64url').length, 32)
      assert.equal(token.includes('@'), false)
      assert.notEqual(token, hashToken(client.email))
      assert.notEqual(token, hashToken(String(client.id)))
      assert.notEqual(token, hashToken(`${client.id}:${client.email}`))
      assert.notEqual(token, hashToken(`${client.email}:${client.id}`))

      const row = store.data.personalLinks[0]
      assert.equal(row.tokenHash, hashToken(token))
      assert.notEqual(row.tokenCipher, token)
      assert.equal(row.tokenCipher.includes(token), false)
      assert.equal(JSON.stringify(store.data).includes(token), false)
      assert.equal(openPersonalToken(row.tokenCipher, SECRET), token)
      assert.equal(openPersonalToken(row.tokenCipher, 'different-test-secret'), null)
      // Flip the first character. The last base64url character can be unused padding bits, so changing it does not always change the ciphertext.
      const flipped = (row.tokenCipher.startsWith('A') ? 'B' : 'A') + row.tokenCipher.slice(1)
      assert.equal(openPersonalToken(flipped, SECRET), null)
      assert.notEqual(sealPersonalToken(token, SECRET), sealPersonalToken(token, SECRET))

      const other = await store.createClient(sample({
        name: 'Other Example',
        email: 'other.example@example.com',
        additionalEmails: [],
      }))
      const otherToken = await ensurePersonalLink(store, other.id, SECRET)
      assert.notEqual(otherToken, token)
      assert.equal(await ensurePersonalLink(store, client.id, SECRET), token)
      assert.equal(personalLinkUrl('https://portal.example.com/', token), `https://portal.example.com/portal/c/${token}`)
    })

    it('accepts the issued token and rejects an unknown or altered one', async () => {
      const { store, client, token } = await setup()
      assert.equal(await personalLinkStatus(store, token), 'ready')
      assert.equal(await personalLinkStatus(store, `  ${token}  `), 'ready')

      const signedIn = await redeemPersonalLink(store, token, client.email, NOW)
      assert.equal(signedIn.ok, true)
      if (signedIn.ok) {
        assert.equal(signedIn.client.id, client.id)
        assert.notEqual(signedIn.sessionToken, token)
        const session = store.data.sessions.find((row) => row.tokenHash === hashToken(signedIn.sessionToken))
        assert.ok(session)
        assert.equal(session.clientId, client.id)
        assert.equal(session.expiresAt, sessionExpiry(NOW))
        assert.equal(new Date(session.expiresAt).getTime() - NOW.getTime(), 14 * DAY_MS)
      }

      const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')
      const altered = await redeemPersonalLink(store, tampered, client.email, NOW)
      assert.equal(altered.ok, false)
      if (!altered.ok) {
        assert.equal(altered.code, 'invalid')
        assert.equal(altered.status, 400)
        assert.equal(altered.error, PERSONAL_LINK_UNAVAILABLE)
        assertGeneric(altered.error)
      }

      const unknown = await redeemPersonalLink(store, newToken(), client.email, NOW)
      assert.equal(unknown.ok, false)
      if (!unknown.ok) assert.equal(unknown.code, 'invalid')
      assert.equal(await personalLinkStatus(store, 'not-a-token'), 'unavailable')
      assert.equal(store.data.personalAttempts.length, 0)
    })
  })

  describe('email match', () => {
    it('signs in the primary email and additional emails, ignoring case and surrounding space', async () => {
      const { store, client, token } = await setup()
      client.additionalEmails = ['  Jo.Person@example.com  ', 'sam.example@example.com']
      assert.equal(emailMatchesClient(client, ' jo.person@example.com '), true)
      assert.equal(emailMatchesClient(client, 'nobody@example.com'), false)

      const primary = await redeemPersonalLink(store, token, '  Casey.Example@example.com ', NOW)
      assert.equal(primary.ok, true)
      if (primary.ok) assert.equal(primary.client.id, client.id)

      const extra = await redeemPersonalLink(store, token, 'SAM.EXAMPLE@example.com', NOW)
      assert.equal(extra.ok, true)
      if (extra.ok) assert.equal(extra.client.id, client.id)

      const spacedExtra = await redeemPersonalLink(store, token, '\tjo.person@example.com\n', NOW)
      assert.equal(spacedExtra.ok, true)
      if (spacedExtra.ok) assert.equal(spacedExtra.client.id, client.id)
      assert.equal(store.data.sessions.length, 3)
    })
  })

  describe('wrong email', () => {
    it('rejects a different address without naming a valid one or opening a session', async () => {
      const { store, token } = await setup()
      await store.createClient(sample({
        name: 'Other Example',
        email: 'other.example@example.com',
        additionalEmails: [],
      }))
      const before = store.data.sessions.length
      for (const email of ['nobody@example.com', 'other.example@example.com', '', 'not-an-email']) {
        const result = await redeemPersonalLink(store, token, email, NOW)
        assert.equal(result.ok, false)
        if (!result.ok) {
          assert.equal(result.code, 'mismatch')
          assert.equal(result.status, 400)
          assert.equal(result.error, PERSONAL_LINK_MISMATCH)
          assertGeneric(result.error)
        }
      }
      assert.equal(store.data.sessions.length, before)
      assert.equal(store.data.personalAttempts.length, 4)
      assert.equal(await store.getClientBySession(hashToken(token), NOW.toISOString()), null)
    })
  })

  describe('inactive client', () => {
    it('does not sign in, and looks the same as an unknown link', async () => {
      const { store, client, token } = await setup()
      await store.updateClient(client.id, sample({ active: false }))
      const unknown = await redeemPersonalLink(store, newToken(), 'casey.example@example.com', NOW)
      for (const email of ['casey.example@example.com', '  SAM.EXAMPLE@example.com  ', 'nobody@example.com']) {
        const result = await redeemPersonalLink(store, token, email, NOW)
        assert.equal(result.ok, false)
        if (!result.ok && !unknown.ok) {
          assert.equal(result.code, 'inactive')
          assert.equal(result.status, unknown.status)
          assert.equal(result.error, unknown.error)
          assert.equal(result.error, PERSONAL_LINK_UNAVAILABLE)
          assertGeneric(result.error)
        }
      }
      assert.equal(await personalLinkStatus(store, token), 'unavailable')
      assert.equal(store.data.sessions.length, 0)
      assert.equal(store.data.personalAttempts.length, 0)

      await store.updateClient(client.id, sample({ active: true }))
      assert.equal(await personalLinkStatus(store, token), 'ready')
      const restored = await redeemPersonalLink(store, token, 'sam.example@example.com', NOW)
      assert.equal(restored.ok, true)
    })
  })

  describe('reset', () => {
    it('invalidates the old link immediately and the new one signs in', async () => {
      const { store, client, token } = await setup()
      const next = await resetPersonalLink(store, client.id, SECRET)
      assert.notEqual(next, token)
      assert.equal(store.data.personalLinks.length, 1)
      assert.equal(store.data.personalLinks[0].tokenHash, hashToken(next))
      assert.equal(JSON.stringify(store.data).includes(next), false)
      assert.equal(JSON.stringify(store.data).includes(token), false)

      const old = await redeemPersonalLink(store, token, 'casey.example@example.com', NOW)
      assert.equal(old.ok, false)
      if (!old.ok) {
        assert.equal(old.code, 'invalid')
        assert.equal(old.error, PERSONAL_LINK_UNAVAILABLE)
      }
      assert.equal(store.data.sessions.length, 0)

      const signedIn = await redeemPersonalLink(store, next, '  sam.example@example.com ', NOW)
      assert.equal(signedIn.ok, true)
      if (signedIn.ok) assert.equal(signedIn.client.email, 'casey.example@example.com')
      assert.equal(store.data.sessions.length, 1)
    })
  })

  describe('attempt limits', () => {
    it('pauses a link after repeated wrong emails, including a later correct one', async () => {
      const { store, token } = await setup()
      for (let i = 0; i < PERSONAL_LINK_SHORT_MAX; i++) {
        const at = new Date(NOW.getTime() + i * 1000)
        const result = await redeemPersonalLink(store, token, 'wrong.person@example.com', at)
        assert.equal(result.ok, false)
        if (!result.ok) assert.equal(result.code, 'mismatch')
      }
      const blocked = await redeemPersonalLink(
        store,
        token,
        'casey.example@example.com',
        new Date(NOW.getTime() + 10_000),
      )
      assert.equal(blocked.ok, false)
      if (!blocked.ok) {
        assert.equal(blocked.code, 'throttled')
        assert.equal(blocked.status, 429)
        assert.equal(blocked.error, PERSONAL_LINK_THROTTLED)
        assertGeneric(blocked.error)
      }
      assert.equal(store.data.sessions.length, 0)

      const later = new Date(NOW.getTime() + PERSONAL_LINK_SHORT_WINDOW_MS + 1000)
      const allowed = await redeemPersonalLink(store, token, 'Casey.Example@example.com', later)
      assert.equal(allowed.ok, true)
      assert.equal(store.data.personalAttempts.length, 0)
    })

    it('also pauses after too many wrong emails spread across a day', async () => {
      const { store, token } = await setup()
      const tokenHash = hashToken(token)
      for (let i = 0; i < PERSONAL_LINK_DAY_MAX; i++) {
        await store.recordPersonalLinkAttempt(
          tokenHash,
          new Date(NOW.getTime() - (i + 1) * 60 * 60 * 1000).toISOString(),
        )
      }
      const blocked = await redeemPersonalLink(store, token, 'sam.example@example.com', NOW)
      assert.equal(blocked.ok, false)
      if (!blocked.ok) {
        assert.equal(blocked.code, 'throttled')
        assertGeneric(blocked.error)
      }
      assert.equal(store.data.sessions.length, 0)
      const recent = await store.countPersonalLinkAttempts(
        tokenHash,
        new Date(NOW.getTime() - PERSONAL_LINK_SHORT_WINDOW_MS).toISOString(),
      )
      const daily = await store.countPersonalLinkAttempts(
        tokenHash,
        new Date(NOW.getTime() - PERSONAL_LINK_DAY_WINDOW_MS).toISOString(),
      )
      assert.equal(recent, 0)
      assert.equal(daily, PERSONAL_LINK_DAY_MAX)
    })
  })

  describe('magic link', () => {
    it('still signs in through the one-time email link', async () => {
      const { store, client, token } = await setup()
      const magic = newToken()
      await store.createMagicLink(client.id, hashToken(magic), magicLinkExpiry(NOW))
      const personal = await redeemPersonalLink(store, token, 'sam.example@example.com', NOW)
      assert.equal(personal.ok, true)
      assert.notEqual(magic, token)
      const consumed = await store.consumeMagicLink(hashToken(magic), NOW.toISOString())
      assert.equal(consumed?.id, client.id)
      assert.equal(await store.consumeMagicLink(hashToken(magic), NOW.toISOString()), null)
    })
  })
})
