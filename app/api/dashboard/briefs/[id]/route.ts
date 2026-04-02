import { NextRequest, NextResponse } from 'next/server'
import { getBriefById } from '@/lib/db'
import { cookies } from 'next/headers'

function isAuthenticated() {
  const cookieStore = cookies()
  return cookieStore.get('prima_session')?.value === 'authenticated'
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isAuthenticated()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const brief = await getBriefById(Number(params.id))
  if (!brief) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ brief })
}
