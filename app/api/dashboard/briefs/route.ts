import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { getAllBriefs } from '@/lib/db'

export async function GET(_req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const briefs = await getAllBriefs()
  return NextResponse.json({ briefs })
}
