import EditsBoard from '../../EditsBoard'
import { loadHubEditBoard } from '@/lib/hub/edit-board'
import { requireHubPage } from '@/lib/hub/session'

export const dynamic = 'force-dynamic'

export default async function EditsPage() {
  await requireHubPage()
  const board = await loadHubEditBoard()
  return (
    <main>
      <p className="hub-kicker">Notion</p>
      <EditsBoard initial={board} />
    </main>
  )
}
