import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  UPLOAD_GRANT_TTL_MS,
  UPLOAD_GUARD_LIMITS,
  authorizeBriefUpload,
  clientIpFromHeaders,
  isSameOrigin,
  resetUploadGuards,
  signUploadGrant,
  uploadGrantValid,
} from '../lib/upload-guard'

const secret = 'test-grant-secret'
const path = 'briefs/script-references/kitchen.jpg'
const photoUrl = 'https://abc123.public.blob.vercel-storage.com/briefs/script-references/kitchen-a1b2c3.jpg'

function allow(overrides: Partial<Parameters<typeof authorizeBriefUpload>[0]> = {}) {
  return authorizeBriefUpload({
    purpose: 'token',
    host: 'brief.example',
    origin: 'https://brief.example',
    secFetchSite: null,
    cookie: signUploadGrant(secret, 1_000),
    secret,
    target: path,
    ip: '203.0.113.10',
    now: 5_000,
    ...overrides,
  })
}

function expectStatus(decision: ReturnType<typeof authorizeBriefUpload>, status: number, pattern?: RegExp) {
  assert.equal(decision.ok, false)
  if (decision.ok) return
  assert.equal(decision.status, status)
  if (pattern) assert.match(decision.error, pattern)
}

describe('brief upload guard', () => {
  beforeEach(() => resetUploadGuards())

  it('requires the blob token, the brief origin, and a live grant', () => {
    expectStatus(allow({ secret: '', cookie: null }), 503)
    expectStatus(allow({ origin: 'https://evil.example' }), 403)
    expectStatus(allow({ origin: null, secFetchSite: 'cross-site' }), 403)
    assert.equal(isSameOrigin('brief.example', null, 'same-origin'), true)
    expectStatus(allow({ cookie: null }), 403, /Refresh the page/)
    expectStatus(allow({ cookie: 'tampered.payload' }), 403, /Refresh the page/)
    expectStatus(allow({ target: 'briefs/script-references/../secret.jpg' }), 400)
    assert.equal(allow().ok, true)
    assert.equal(allow({ purpose: 'grant', cookie: null, target: null, ip: '203.0.113.11' }).ok, true)
    assert.equal(allow({ purpose: 'delete', target: photoUrl, ip: '203.0.113.12' }).ok, true)
    expectStatus(allow({ purpose: 'delete', target: 'https://evil.example/a.jpg', ip: '203.0.113.13' }), 400)
  })

  it('rejects an expired or edited grant', () => {
    const token = signUploadGrant(secret, 1_000)
    assert.equal(uploadGrantValid(secret, token, 1_000 + UPLOAD_GRANT_TTL_MS - 1), true)
    assert.equal(uploadGrantValid(secret, token, 1_000 + UPLOAD_GRANT_TTL_MS + 1), false)
    const [payload, sig] = token.split('.')
    const flipped = `${payload}.${sig.slice(0, -1)}${sig.endsWith('a') ? 'b' : 'a'}`
    assert.equal(uploadGrantValid(secret, flipped, 5_000), false)
    assert.equal(uploadGrantValid('', token, 5_000), false)
  })

  it('rate limits token minting per address and does not count rejected calls', () => {
    const ip = '203.0.113.40'
    for (let i = 0; i < 100; i += 1) {
      const rejected = allow({ ip, origin: 'https://evil.example' })
      assert.equal(rejected.ok, false)
    }
    for (let i = 0; i < UPLOAD_GUARD_LIMITS.tokensPerWindow; i += 1) {
      assert.equal(allow({ ip }).ok, true)
    }
    const blocked = allow({ ip })
    expectStatus(blocked, 429)
    assert.equal(allow({ ip: '203.0.113.41' }).ok, true)
  })

  it('reads the platform client address', () => {
    const headers = new Headers({ 'x-real-ip': '198.51.100.8', 'x-forwarded-for': '203.0.113.9' })
    assert.equal(clientIpFromHeaders(headers), '198.51.100.8')
    assert.equal(clientIpFromHeaders(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })), '203.0.113.9')
    assert.equal(clientIpFromHeaders(new Headers()), 'unknown')
  })
})
