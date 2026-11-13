import QuickAddForm from '../../../QuickAddForm'
import { requireHubPage } from '@/lib/hub/session'
import { chicagoToday } from '@/lib/portal/cycle'

export const dynamic = 'force-dynamic'

export default async function NewLeadPage() {
  await requireHubPage()
  return (
    <main>
      <p className="hub-kicker">Pipeline</p>
      <h1>New lead</h1>
      <p className="hub-date">For a referral or an Instagram DM. Website forms and Acuity discovery calls arrive on their own.</p>
      <div style={{ marginTop: 16 }}>
        <QuickAddForm today={chicagoToday()} />
      </div>
    </main>
  )
}
