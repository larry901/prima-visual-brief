import { notFound, redirect } from 'next/navigation'
import BriefForm from '@/app/brief/BriefForm'
import { editWindow, prefillFromBrief, shootStartsForClient } from '@/lib/brief-service'
import { clientOwnsBrief } from '@/lib/brief-logic'
import { ensureDemoSeed } from '@/lib/portal/seed'
import { readPortalClient } from '@/lib/portal/session'
import { getPortalStore } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

export default async function EditPortalBriefPage({ params }: { params: { id: string } }) {
  const store = getPortalStore()
  await store.ensureReady()
  await ensureDemoSeed(store)
  const client = await readPortalClient(store)
  if (!client) redirect('/portal')
  const id = Number(params.id)
  const brief = Number.isInteger(id) ? await store.getBriefById(id) : null
  if (!brief || !clientOwnsBrief(brief, client)) notFound()
  const starts = await shootStartsForClient(store, brief.client_id ?? client.id)
  if (!editWindow(brief, starts, new Date()).editable) redirect(`/portal/briefs/${brief.id}`)
  return (
    <BriefForm
      prefill={prefillFromBrief(brief)}
      edit={{ id: brief.id }}
      backHref={`/portal/briefs/${brief.id}`}
    />
  )
}
