import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { getBriefById } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const brief = await getBriefById(Number(params.id))
  if (!brief) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ brief })
}
