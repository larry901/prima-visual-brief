import EditsBoard from '../../EditsBoard'
import { sampleStaffEdits } from '@/lib/hub/edits'
import { requireHubPage } from '@/lib/hub/session'
import { demoSeedEnabled } from '@/lib/portal/seed'
import { loadStaffEditBoard, notionConfigured } from '@/lib/portal/notion-edits'

export const dynamic = 'force-dynamic'

export default async function EditsPage() {
  await requireHubPage()
  const configured = notionConfigured()
  const board = configured ? await loadStaffEditBoard() : null
  const usingSample = !configured && demoSeedEnabled()
  const edits = board?.edits ?? (usingSample ? sampleStaffEdits() : [])
  const mode = board ? 'notion' : usingSample ? 'sample' : configured ? 'error' : 'empty'
  return (
    <main>
      <EditsBoard initialEdits={edits} initialUpdatedAt={board?.fetchedAt ?? new Date().toISOString()} mode={mode} />
    </main>
  )
}
