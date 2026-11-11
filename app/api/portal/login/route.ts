import { requestPortalLink } from '@/lib/portal/login'
import { requestOrigin } from '@/lib/portal/origin'
import { ensureDemoSeed } from '@/lib/portal/seed'
import { getPortalStore } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const store = getPortalStore()
    await store.ensureReady()
    await ensureDemoSeed(store)
    const body = await request.json().catch(() => null)
    const email = body && typeof body === 'object' && typeof (body as { email?: unknown }).email === 'string'
      ? (body as { email: string }).email
      : ''
    const result = await requestPortalLink(store, email, requestOrigin(request))
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status })
    }
    return Response.json({
      ok: true,
      message: 'If that email is on the Prima Visual client list, a sign-in link is on its way.',
      demoUrl: result.demoUrl,
    })
  } catch (error) {
    console.error('Portal login failed:', error)
    return Response.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
  }
}
