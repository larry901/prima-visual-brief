import { NextRequest, NextResponse } from 'next/server'
import { getAllBriefs } from '@/lib/db'
import { cookies } from 'next/headers'

function isAuthenticated() {
  const cookieStore = cookies()
  return cookieStore.get('prima_session')?.value === 'authenticated'
}

export async function GET(_req: NextRequest) {
  if (!isAuthenticated()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const briefs = await getAllBriefs()
  return NextResponse.json({ briefs })
}
