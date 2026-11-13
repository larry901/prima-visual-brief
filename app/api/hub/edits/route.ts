import { loadHubEditBoard } from '@/lib/hub/edit-board'
import { hubDenied, requireHubStaff } from '@/lib/hub/guard'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const staff = await requireHubStaff()
  if (hubDenied(staff)) return staff
  const fresh = new URL(request.url).searchParams.get('fresh') === '1'
  try {
    const board = await loadHubEditBoard({ fresh })
    return Response.json(board, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Staff edits refresh failed', error instanceof Error ? error.message : 'error')
    return Response.json({ error: 'Could not refresh edits' }, { status: 500 })
  }
}
