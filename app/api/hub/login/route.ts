import { requestStaffLink } from '@/lib/hub/auth'
import { getHubStore } from '@/lib/hub/store'
import { requestOrigin } from '@/lib/portal/origin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const hub = getHubStore()
    await hub.ensureReady()
    const body = await request.json().catch(() => null)
    const email =
      body && typeof body === 'object' && typeof (body as { email?: unknown }).email === 'string'
        ? (body as { email: string }).email
        : ''
    const result = await requestStaffLink(hub, email, requestOrigin(request))
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
    return Response.json({
      ok: true,
      message: 'If that email is on the staff list, a sign-in link is on its way.',
      demoUrl: result.demoUrl,
    })
  } catch (error) {
    console.error('Hub login failed:', error instanceof Error ? error.message : 'error')
    return Response.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
  }
}
