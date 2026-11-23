import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  STAFF_CODE_ATTEMPT_WINDOW_MS,
  STAFF_CODE_EMAIL_MAX_ATTEMPTS,
  STAFF_CODE_INVALID,
  STAFF_CODE_LIMITED,
  STAFF_CODE_MAX_ATTEMPTS,
  hashStaffCode,
  issueHubSession,
  redeemStaffCode,
  requestStaffLink,
} from '../lib/hub/auth'
import { hubSignInEmailContent } from '../lib/hub/mail'
import { MemoryHubStore, emptyHubData, type MemoryHubData } from '../lib/hub/memory-store'
import { hashToken } from '../lib/portal/tokens'

const NOW = new Date('2026-11-23T15:00:00.000Z')
const ORIGIN = 'https://brief.primavisual.io'

async function withStaff(emails: string, fn: () => Promise<void>) {
  const original = process.env.STAFF_EMAILS
  const originalDemo = process.env.PORTAL_DEMO_SEED
  process.env.STAFF_EMAILS = emails
  process.env.PORTAL_DEMO_SEED = 'true'
  try {
    await fn()
  } finally {
    if (original === undefined) delete process.env.STAFF_EMAILS
    else process.env.STAFF_EMAILS = original
    if (originalDemo === undefined) delete process.env.PORTAL_DEMO_SEED
    else process.env.PORTAL_DEMO_SEED = originalDemo
  }
}

async function requestCode(hub: MemoryHubStore, email: string, now: Date = NOW) {
  const result = await requestStaffLink(hub, email, ORIGIN, now)
  assert.equal(result.ok, true)
  if (!result.ok || !result.demoCode || !result.demoUrl) throw new Error('expected a demo sign-in code')
  return { code: result.demoCode, url: result.demoUrl }
}

function wrongCode(taken: string[]): string {
  for (let value = 0; value < 1_000_000; value += 1) {
    const code = value.toString().padStart(6, '0')
    if (!taken.includes(code)) return code
  }
  throw new Error('no unused code')
}

describe('hub sign-in code', () => {
  it('stores an HMAC of the code, not the code, and keeps it out of the link', async () => {
    await withStaff('owner@example.com', async () => {
      const hub = new MemoryHubStore()
      const hidden = await requestStaffLink(hub, 'stranger@example.com', ORIGIN, NOW)
      assert.deepEqual(hidden, { ok: true })
      assert.equal(hub.data.magicLinks.length, 0)

      const { code, url } = await requestCode(hub, 'Owner@example.com')
      assert.equal(url.includes(code), false)
      const row = hub.data.magicLinks[0]
      assert.equal(row.email, 'owner@example.com')
      assert.equal(row.codeHash, hashStaffCode('owner@example.com', code, row.codeSalt ?? ''))
      assert.notEqual(row.codeHash, code)
      assert.equal(row.codeAttempts, 0)
      assert.equal(row.codeUsedAt, null)
      assert.equal(JSON.stringify(row).includes(`"${code}"`), false)
    })
  })

  it('signs in with the code once, including spaces and a different address case', async () => {
    await withStaff('owner@example.com', async () => {
      const hub = new MemoryHubStore()
      const { code } = await requestCode(hub, 'owner@example.com')
      const spaced = `${code.slice(0, 3)} ${code.slice(3)}`
      const first = await redeemStaffCode(hub, 'Owner@example.com', spaced, NOW)
      assert.deepEqual(first, { ok: true, email: 'owner@example.com' })
      assert.equal(hub.data.magicLinks[0].codeUsedAt, NOW.toISOString())
      assert.equal(hub.data.magicLinks[0].usedAt, null)

      const session = await issueHubSession(hub, first.ok ? first.email : '', NOW)
      assert.equal(await hub.getStaffBySession(hashToken(session), NOW.toISOString()), 'owner@example.com')

      const second = await redeemStaffCode(hub, 'owner@example.com', code, NOW)
      assert.equal(second.ok, false)
      if (!second.ok) {
        assert.equal(second.status, 401)
        assert.equal(second.error, STAFF_CODE_INVALID)
      }
    })
  })

  it('lets the link and the code each sign in once', async () => {
    await withStaff('owner@example.com', async () => {
      const hub = new MemoryHubStore()
      const { code, url } = await requestCode(hub, 'owner@example.com')
      const token = new URL(url).searchParams.get('token')
      assert.ok(token)

      const byCode = await redeemStaffCode(hub, 'owner@example.com', code, NOW)
      assert.equal(byCode.ok, true)
      const byLink = await hub.consumeStaffMagicLink(hashToken(token as string), NOW.toISOString())
      assert.equal(byLink, 'owner@example.com')
      assert.equal(await hub.consumeStaffMagicLink(hashToken(token as string), NOW.toISOString()), null)

      const again = new MemoryHubStore()
      const issued = await requestCode(again, 'owner@example.com')
      const linkToken = new URL(issued.url).searchParams.get('token') as string
      assert.equal(await again.consumeStaffMagicLink(hashToken(linkToken), NOW.toISOString()), 'owner@example.com')
      const still = await redeemStaffCode(again, 'owner@example.com', issued.code, NOW)
      assert.equal(still.ok, true)
      assert.equal(again.data.magicLinks[0].usedAt, NOW.toISOString())
    })
  })

  it('does not say whether an address is on the staff list', async () => {
    await withStaff('owner@example.com', async () => {
      const hub = new MemoryHubStore()
      const { code } = await requestCode(hub, 'owner@example.com')
      const stranger = await redeemStaffCode(hub, 'stranger@example.com', '123456', NOW)
      const wrong = await redeemStaffCode(hub, 'owner@example.com', wrongCode([code, '123456']), NOW)
      const missing = await redeemStaffCode(hub, 'nobody@example.com', '123456', NOW)
      assert.equal(stranger.ok, false)
      assert.equal(wrong.ok, false)
      assert.equal(missing.ok, false)
      if (!stranger.ok && !wrong.ok && !missing.ok) {
        assert.equal(stranger.status, 401)
        assert.equal(stranger.status, wrong.status)
        assert.equal(missing.status, wrong.status)
        assert.equal(stranger.error, wrong.error)
        assert.equal(missing.error, STAFF_CODE_INVALID)
      }
      assert.equal(hub.data.magicLinks[0].codeUsedAt, null)
    })
  })

  it('ties a code to the address it was sent to', async () => {
    await withStaff('owner@example.com, assistant@example.com', async () => {
      const hub = new MemoryHubStore()
      const owner = await requestCode(hub, 'owner@example.com')
      const assistant = await requestCode(hub, 'assistant@example.com')
      const crossed = await redeemStaffCode(hub, 'assistant@example.com', owner.code, NOW)
      assert.equal(crossed.ok, false)
      const ownerStill = await redeemStaffCode(hub, 'owner@example.com', owner.code, NOW)
      assert.equal(ownerStill.ok, true)
      const assistantStill = await redeemStaffCode(hub, 'assistant@example.com', assistant.code, NOW)
      assert.equal(assistantStill.ok, true)
    })
  })

  it('retires a code after too many wrong tries and keeps an older code', async () => {
    await withStaff('owner@example.com', async () => {
      const hub = new MemoryHubStore()
      const older = await requestCode(hub, 'owner@example.com')
      const newer = await requestCode(hub, 'owner@example.com')
      const wrong = wrongCode([older.code, newer.code])
      for (let attempt = 0; attempt < STAFF_CODE_MAX_ATTEMPTS; attempt += 1) {
        const failed = await redeemStaffCode(hub, 'owner@example.com', wrong, NOW)
        assert.equal(failed.ok, false)
        if (!failed.ok) assert.equal(failed.status, 401)
      }
      assert.equal(hub.data.magicLinks[1].codeAttempts, STAFF_CODE_MAX_ATTEMPTS)
      assert.equal(hub.data.magicLinks[0].codeAttempts, 0)
      const olderStill = await redeemStaffCode(hub, 'owner@example.com', older.code, NOW)
      assert.equal(olderStill.ok, true)
      const newerBlocked = await redeemStaffCode(hub, 'owner@example.com', newer.code, NOW)
      assert.equal(newerBlocked.ok, false)
    })
  })

  it('pauses an address after repeated guesses, then accepts a code once the window passes', async () => {
    await withStaff('owner@example.com', async () => {
      const hub = new MemoryHubStore()
      const first = await requestCode(hub, 'owner@example.com', NOW)
      const wrong = wrongCode([first.code])
      for (let attempt = 0; attempt < STAFF_CODE_EMAIL_MAX_ATTEMPTS; attempt += 1) {
        const failed = await redeemStaffCode(hub, 'owner@example.com', wrong, NOW)
        assert.equal(failed.ok, false)
      }
      const second = await requestCode(hub, 'owner@example.com', NOW)
      const locked = await redeemStaffCode(hub, 'owner@example.com', second.code, NOW)
      assert.equal(locked.ok, false)
      if (!locked.ok) {
        assert.equal(locked.status, 429)
        assert.equal(locked.error, STAFF_CODE_LIMITED)
      }
      assert.equal(hub.data.magicLinks[1].codeUsedAt, null)

      const later = new Date(NOW.getTime() + STAFF_CODE_ATTEMPT_WINDOW_MS + 1000)
      const opened = await redeemStaffCode(hub, 'owner@example.com', second.code, later)
      assert.equal(opened.ok, true)
    })
  })

  it('rejects a code after the same expiry as the link, and ignores bad input', async () => {
    await withStaff('owner@example.com', async () => {
      const hub = new MemoryHubStore()
      const { code } = await requestCode(hub, 'owner@example.com')
      const expiredAt = new Date(NOW.getTime() + 20 * 60 * 1000 + 1000)
      const expired = await redeemStaffCode(hub, 'owner@example.com', code, expiredAt)
      assert.equal(expired.ok, false)
      if (!expired.ok) assert.equal(expired.status, 401)
      assert.equal(await hub.consumeStaffMagicLink(hub.data.magicLinks[0].tokenHash, expiredAt.toISOString()), null)

      for (let attempt = 0; attempt < STAFF_CODE_EMAIL_MAX_ATTEMPTS + 2; attempt += 1) {
        const bad = await redeemStaffCode(hub, 'owner@example.com', 'nope', NOW)
        assert.equal(bad.ok, false)
        if (!bad.ok) assert.equal(bad.status, 400)
      }
      const fresh = new MemoryHubStore()
      const issued = await requestCode(fresh, 'owner@example.com')
      const still = await redeemStaffCode(fresh, 'not-an-email', issued.code, NOW)
      assert.equal(still.ok, false)
      if (!still.ok) assert.equal(still.status, 400)
      assert.equal((await redeemStaffCode(fresh, 'owner@example.com', issued.code, NOW)).ok, true)
    })
  })

  it('does not burn a code when the address is no longer on the staff list', async () => {
    const original = process.env.STAFF_EMAILS
    const originalDemo = process.env.PORTAL_DEMO_SEED
    process.env.STAFF_EMAILS = 'owner@example.com'
    process.env.PORTAL_DEMO_SEED = 'true'
    try {
      const hub = new MemoryHubStore()
      const { code } = await requestCode(hub, 'owner@example.com')
      process.env.STAFF_EMAILS = 'assistant@example.com'
      const denied = await redeemStaffCode(hub, 'owner@example.com', code, NOW)
      assert.equal(denied.ok, false)
      if (!denied.ok) assert.equal(denied.error, STAFF_CODE_INVALID)
      assert.equal(hub.data.magicLinks[0].codeUsedAt, null)

      process.env.STAFF_EMAILS = 'owner@example.com'
      const allowed = await redeemStaffCode(hub, 'owner@example.com', code, NOW)
      assert.equal(allowed.ok, true)
    } finally {
      if (original === undefined) delete process.env.STAFF_EMAILS
      else process.env.STAFF_EMAILS = original
      if (originalDemo === undefined) delete process.env.PORTAL_DEMO_SEED
      else process.env.PORTAL_DEMO_SEED = originalDemo
    }
  })

  it('stops issuing codes at the same hourly limit as links', async () => {
    await withStaff('owner@example.com', async () => {
      const hub = new MemoryHubStore()
      for (let sent = 0; sent < 5; sent += 1) await requestCode(hub, 'owner@example.com')
      const blocked = await requestStaffLink(hub, 'owner@example.com', ORIGIN, NOW)
      assert.deepEqual(blocked, { ok: true })
      assert.equal(hub.data.magicLinks.length, 5)
    })
  })

  it('accepts a leading-zero code typed with dashes', async () => {
    await withStaff('owner@example.com', async () => {
      const hub = new MemoryHubStore()
      const code = '000042'
      const salt = 'salt-for-leading-zero'
      await hub.createStaffMagicLink(
        'owner@example.com',
        hashToken('link-token'),
        new Date(NOW.getTime() + 20 * 60 * 1000).toISOString(),
        { hash: hashStaffCode('owner@example.com', code, salt), salt },
        NOW,
      )
      const redeemed = await redeemStaffCode(hub, 'owner@example.com', '000-042', NOW)
      assert.equal(redeemed.ok, true)
    })
  })

  it('loads a hub file from before codes existed', () => {
    const legacy = {
      ...emptyHubData(),
      magicLinks: [
        {
          id: 1,
          email: 'owner@example.com',
          tokenHash: 'abc',
          expiresAt: '2026-11-23T15:20:00.000Z',
          usedAt: null,
          createdAt: '2026-11-23T15:00:00.000Z',
        },
      ],
    }
    delete (legacy as { signInAttempts?: unknown }).signInAttempts
    const hub = new MemoryHubStore(legacy as MemoryHubData)
    assert.equal(hub.data.magicLinks[0].codeHash, null)
    assert.equal(hub.data.magicLinks[0].codeAttempts, 0)
    assert.deepEqual(hub.data.signInAttempts, [])
  })

  it('tells the installed app to use the code and keeps the browser link', () => {
    const hostile = 'https://brief.example/hub/verify?token=abc&next="><script>'
    const message = hubSignInEmailContent(hostile, '123456')
    assert.equal(message.subject, 'Your Prima Hub sign-in code')
    assert.match(message.text, /123456 is your Prima Hub sign-in code/)
    assert.match(message.text, /home screen/)
    assert.match(message.text, /Safari/)
    assert.equal(message.text.includes(hostile), true)
    assert.equal(message.html.includes('<script>'), false)
    assert.match(message.html, /&quot;&gt;&lt;script&gt;/)
    assert.match(message.html, /Sign in with a browser/)
    assert.equal(message.html.includes(`href="${hostile}"`), false)
    assert.throws(() => hubSignInEmailContent(hostile, '12345'), /Invalid sign-in code/)
  })
})
