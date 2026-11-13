import { clearAuthCookie } from '../auth'
import { clearHubCookie, readHubStaff, type HubStaff } from './session'
import { NextResponse } from 'next/server'

export async function requireHubStaff(): Promise<HubStaff | NextResponse> {
  const staff = await readHubStaff()
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return staff
}

export function hubDenied(value: HubStaff | NextResponse): value is NextResponse {
  return value instanceof NextResponse
}

/** Ends the hub session and the dashboard session, because that password session also opens the hub. */
export function staffSignOutResponse(): NextResponse {
  const response = NextResponse.json({ ok: true })
  clearHubCookie(response)
  clearAuthCookie(response)
  return response
}
