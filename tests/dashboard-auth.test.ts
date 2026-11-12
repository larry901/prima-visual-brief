import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { afterEach, describe, it } from 'node:test'
import { NextRequest } from 'next/server'
import { POST as login } from '../app/api/dashboard/login/route'
import { POST as logout } from '../app/api/dashboard/logout/route'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  dashboardPasswordMatches,
  verifySessionToken,
} from '../lib/dashboard-session'
import { middleware } from '../middleware'

const PASSWORD = 'test-dashboard-password'
const ISSUED_AT_MS = 1_700_000_000_000
const ORIGINAL_PASSWORD = process.env.DASHBOARD_PASSWORD
const ORIGINAL_NODE_ENV = process.env.NODE_ENV

function setNodeEnv(value: string | undefined) {
  if (value === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV')
  else Reflect.set(process.env, 'NODE_ENV', value)
}

afterEach(() => {
  if (ORIGINAL_PASSWORD === undefined) delete process.env.DASHBOARD_PASSWORD
  else process.env.DASHBOARD_PASSWORD = ORIGINAL_PASSWORD
  setNodeEnv(ORIGINAL_NODE_ENV)
})

function independentSignature(password: string, payloadPart: string): string {
  const key = createHash('sha256').update(`prima-dashboard-session:${password}`).digest()
  return createHmac('sha256', key).update(payloadPart).digest('base64url')
}

function payloadPart(iat: number): string {
  return Buffer.from(JSON.stringify({ iat, exp: iat + SESSION_MAX_AGE_SECONDS })).toString('base64url')
}

function signed(password: string, iat: number): string {
  const payload = payloadPart(iat)
  return `${payload}.${independentSignature(password, payload)}`
}

function flipLast(value: string): string {
  return value.slice(0, -1) + (value.endsWith('a') ? 'b' : 'a')
}

function tamperSignature(token: string): string {
  const [payload, signature] = token.split('.')
  const bytes = Buffer.from(signature, 'base64url')
  bytes[0] ^= 0xff
  return `${payload}.${bytes.toString('base64url')}`
}

function cookieHeader(response: Response): string {
  const parts = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
  if (parts.length > 0) return parts.join('\n')
  return response.headers.get('set-cookie') ?? ''
}

function cookieValue(header: string, name: string): string | null {
  const line = header.split('\n').find((part) => part.startsWith(`${name}=`))
  if (!line) return null
  const rest = line.slice(name.length + 1)
  const semi = rest.indexOf(';')
  const raw = (semi === -1 ? rest : rest.slice(0, semi)).trim()
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function loginRequest(password: unknown, body?: string): NextRequest {
  return new NextRequest('http://localhost/api/dashboard/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ?? JSON.stringify({ password }),
  })
}

describe('staff dashboard auth', { concurrency: 1 }, () => {
  describe('dashboard session token', () => {
    it('rejects a forged authenticated cookie', async () => {
      process.env.DASHBOARD_PASSWORD = PASSWORD
      assert.equal(await verifySessionToken('authenticated'), false)
      assert.equal(await verifySessionToken(''), false)
      assert.equal(await verifySessionToken(null), false)
    })

    it('accepts a token signed with the password-derived HMAC key', async () => {
      process.env.DASHBOARD_PASSWORD = PASSWORD
      const iat = ISSUED_AT_MS / 1000
      const token = await createSessionToken(ISSUED_AT_MS)
      const [payload, signature] = token.split('.')
      assert.equal(payload, payloadPart(iat))
      assert.equal(signature, independentSignature(PASSWORD, payload))
      assert.equal(await verifySessionToken(token, ISSUED_AT_MS + 1000), true)
      assert.equal(await verifySessionToken(signed(PASSWORD, iat), ISSUED_AT_MS + 1000), true)
    })

    it('rejects a tampered payload or signature', async () => {
      process.env.DASHBOARD_PASSWORD = PASSWORD
      const iat = ISSUED_AT_MS / 1000
      const token = signed(PASSWORD, iat)
      const [payload, signature] = token.split('.')
      assert.equal(await verifySessionToken(`${flipLast(payload)}.${signature}`, ISSUED_AT_MS + 1000), false)
      assert.equal(await verifySessionToken(tamperSignature(token), ISSUED_AT_MS + 1000), false)
      assert.equal(await verifySessionToken(`${payload}.${signature.slice(0, -4)}`, ISSUED_AT_MS + 1000), false)
      assert.equal(await verifySessionToken(signed('other-dashboard-password', iat), ISSUED_AT_MS + 1000), false)
    })

    it('rejects an expired token and a token whose issued-at is too far ahead', async () => {
      process.env.DASHBOARD_PASSWORD = PASSWORD
      const iat = ISSUED_AT_MS / 1000
      const token = signed(PASSWORD, iat)
      const expMs = (iat + SESSION_MAX_AGE_SECONDS) * 1000
      assert.equal(await verifySessionToken(token, expMs - 1000), true)
      assert.equal(await verifySessionToken(token, expMs), false)
      assert.equal(await verifySessionToken(signed(PASSWORD, iat + 30), ISSUED_AT_MS), true)
      assert.equal(await verifySessionToken(signed(PASSWORD, iat + 5 * 60), ISSUED_AT_MS), false)
    })

    it('stops accepting old cookies when the password changes or is removed', async () => {
      process.env.DASHBOARD_PASSWORD = PASSWORD
      const token = await createSessionToken(ISSUED_AT_MS)
      process.env.DASHBOARD_PASSWORD = 'rotated-dashboard-password'
      assert.equal(await verifySessionToken(token, ISSUED_AT_MS + 1000), false)
      delete process.env.DASHBOARD_PASSWORD
      assert.equal(await verifySessionToken(token, ISSUED_AT_MS + 1000), false)
      assert.equal(await dashboardPasswordMatches(PASSWORD), false)
      assert.equal(await dashboardPasswordMatches(undefined), false)
    })
  })

  describe('dashboard login', { concurrency: 1 }, () => {
    it('accepts the password and sets a signed 7-day cookie', async () => {
      process.env.DASHBOARD_PASSWORD = PASSWORD
      setNodeEnv('test')
      const response = await login(loginRequest(PASSWORD))
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { success: true })

      const header = cookieHeader(response)
      const value = cookieValue(header, SESSION_COOKIE)
      assert.ok(value)
      assert.notEqual(value, 'authenticated')
      assert.equal(await verifySessionToken(value), true)
      assert.match(header, /HttpOnly/i)
      assert.match(header, /SameSite=Lax/i)
      assert.match(header, new RegExp(`Max-Age=${SESSION_MAX_AGE_SECONDS}`))
      assert.match(header, /Path=\//i)
      assert.doesNotMatch(header, /Secure/i)
    })

    it('marks the cookie Secure in production', async () => {
      process.env.DASHBOARD_PASSWORD = PASSWORD
      setNodeEnv('production')
      const response = await login(loginRequest(PASSWORD))
      assert.match(cookieHeader(response), /Secure/i)
    })

    it('rejects a wrong password, a missing password, and an unset dashboard password', async () => {
      process.env.DASHBOARD_PASSWORD = PASSWORD
      const wrong = await login(loginRequest('wrong-dashboard-password'))
      assert.equal(wrong.status, 401)
      assert.equal(cookieHeader(wrong), '')
      assert.deepEqual(await wrong.json(), { error: 'Invalid password' })

      const missing = await login(loginRequest(undefined, '{}'))
      assert.equal(missing.status, 401)
      assert.equal(cookieHeader(missing), '')

      const broken = await login(loginRequest(PASSWORD, '{'))
      assert.equal(broken.status, 401)

      delete process.env.DASHBOARD_PASSWORD
      const unset = await login(loginRequest(PASSWORD))
      assert.equal(unset.status, 401)
      assert.equal(cookieHeader(unset), '')

      process.env.DASHBOARD_PASSWORD = ''
      const empty = await login(loginRequest(''))
      assert.equal(empty.status, 401)
      assert.equal(cookieHeader(empty), '')
    })

    it('clears the session cookie on logout', async () => {
      setNodeEnv('production')
      const response = await logout()
      const header = cookieHeader(response)
      assert.equal(response.status, 200)
      assert.equal(cookieValue(header, SESSION_COOKIE), '')
      assert.match(header, /Max-Age=0/)
      assert.match(header, /HttpOnly/i)
      assert.match(header, /SameSite=Lax/i)
      assert.match(header, /Secure/i)
      assert.match(header, /Path=\//i)
    })
  })

  describe('dashboard middleware', { concurrency: 1 }, () => {
    it('rejects a forged, tampered, or expired cookie on pages and APIs', async () => {
      process.env.DASHBOARD_PASSWORD = PASSWORD
      const iat = ISSUED_AT_MS / 1000
      const expired = signed(PASSWORD, iat)
      const cases = [
        { cookie: 'authenticated', url: 'http://localhost/dashboard/briefs', status: 307 },
        { cookie: 'authenticated', url: 'http://localhost/api/dashboard/briefs', status: 401 },
        { cookie: tamperSignature(signed(PASSWORD, Math.floor(Date.now() / 1000))), url: 'http://localhost/dashboard/clients', status: 307 },
        { cookie: expired, url: 'http://localhost/api/dashboard/clients', status: 401 },
      ]

      for (const item of cases) {
        if (item.cookie === expired) {
          assert.equal(await verifySessionToken(expired, (iat + SESSION_MAX_AGE_SECONDS) * 1000), false)
        }
        const response = await middleware(
          new NextRequest(item.url, { headers: { cookie: `${SESSION_COOKIE}=${item.cookie}` } }),
        )
        assert.equal(response.status, item.status, item.url)
        if (item.status === 307) {
          assert.equal(new URL(response.headers.get('location') ?? '').pathname, '/dashboard')
        }
      }
    })

    it('allows a valid session and leaves login and logout public', async () => {
      process.env.DASHBOARD_PASSWORD = PASSWORD
      const token = await createSessionToken()
      const allowed = await middleware(
        new NextRequest('http://localhost/dashboard/briefs', {
          headers: { cookie: `${SESSION_COOKIE}=${token}` },
        }),
      )
      assert.equal(allowed.status, 200)
      assert.equal(allowed.headers.get('location'), null)
      assert.equal(allowed.headers.get('x-middleware-next'), '1')

      const loginResponse = await middleware(new NextRequest('http://localhost/api/dashboard/login', { method: 'POST' }))
      assert.equal(loginResponse.headers.get('x-middleware-next'), '1')

      const logoutResponse = await middleware(
        new NextRequest('http://localhost/api/dashboard/logout', {
          method: 'POST',
          headers: { cookie: `${SESSION_COOKIE}=authenticated` },
        }),
      )
      assert.equal(logoutResponse.headers.get('x-middleware-next'), '1')
    })
  })
})
