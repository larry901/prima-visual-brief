import { NextRequest, NextResponse } from 'next/server'
import { dashboardPasswordMatches, setAuthCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  let password: unknown
  try {
    const body: unknown = await req.json()
    password =
      body && typeof body === 'object' && 'password' in body
        ? (body as { password?: unknown }).password
        : undefined
  } catch {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  if (!(await dashboardPasswordMatches(password))) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const res = NextResponse.json({ success: true })
  await setAuthCookie(res)
  return res
}
