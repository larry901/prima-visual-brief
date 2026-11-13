import type { DueFollowUpNotice } from './followups'

/**
 * Phase 2 web push plugs in here.
 * Phase 1 does not register a sender, does not ask for notification permission,
 * and does not contact leads or clients.
 *
 * A later sender should only notify staff devices about due follow-ups.
 * It must return quickly. The Today page awaits this hook.
 */
export type FollowUpPushSender = (notices: DueFollowUpNotice[]) => Promise<void>

let sender: FollowUpPushSender | null = null

export function setFollowUpPushSender(next: FollowUpPushSender | null): void {
  sender = next
}

export function followUpPushConfigured(): boolean {
  return sender != null
}

export async function notifyDueFollowUps(notices: DueFollowUpNotice[]): Promise<void> {
  if (!sender || notices.length === 0) return
  await sender(notices)
}
