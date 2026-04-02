import { cookies } from 'next/headers'

const SESSION_COOKIE = 'prima_session'
const SESSION_VALUE = 'authenticated'

export function isAuthenticated(): boolean {
  const cookieStore = cookies()
  const session = cookieStore.get(SESSION_COOKIE)
  return session?.value === SESSION_VALUE
}

export function setAuthCookie(response: Response): void {
  response.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=${SESSION_VALUE}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`
  )
}

export function clearAuthCookie(response: Response): void {
  response.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  )
}
