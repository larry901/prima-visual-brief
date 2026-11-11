import BriefForm from '../BriefForm'
import { editWindow, prefillFromBrief, shootStartsForClient } from '@/lib/brief-service'
import { getPortalStore } from '@/lib/portal/store'
import { hashToken } from '@/lib/portal/tokens'

export const dynamic = 'force-dynamic'

export default async function TokenEditPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token?.trim()
  if (!token) return <Message title="Link missing" body="Open the edit link from your confirmation screen." />
  const store = getPortalStore()
  await store.ensureReady()
  const brief = await store.getBriefByEditTokenHash(hashToken(token))
  if (!brief) return <Message title="Link not valid" body="This edit link does not match a brief." />
  const starts = await shootStartsForClient(store, brief.client_id)
  if (!editWindow(brief, starts, new Date()).editable) {
    return (
      <Message
        title="This brief is locked"
        body="The shoot has started, so the brief is read-only. Contact us for changes — clients@primavisual.io."
      />
    )
  }
  return <BriefForm prefill={prefillFromBrief(brief)} edit={{ id: brief.id, token }} backHref="/portal" />
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="font-display text-3xl font-semibold mb-3">{title}</h1>
        <p className="text-brand-muted">{body}</p>
      </div>
    </div>
  )
}
