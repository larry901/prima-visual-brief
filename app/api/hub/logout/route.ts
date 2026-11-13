import { staffSignOutResponse } from '@/lib/hub/guard'

export const dynamic = 'force-dynamic'

export async function POST() {
  return staffSignOutResponse()
}
