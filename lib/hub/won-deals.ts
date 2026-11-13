import { isIsoDate } from '../portal/cycle'
import { parseDollars } from './money'
import { isServiceType, type NewWonDeal } from './types'

/** Staff-entered won deal that was never a lead. Value is whole dollars. */
export function parseWonDeal(body: unknown): { ok: true; value: NewWonDeal } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Expected a JSON object' }
  const record = body as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  if (!name || name.length > 200) return { ok: false, error: 'Name is required' }
  const serviceType = record.serviceType ?? record.service_type
  if (!isServiceType(serviceType)) return { ok: false, error: 'Type must be a one-off project or a subscription' }
  const wonOn = typeof record.wonOn === 'string' ? record.wonOn : typeof record.won_on === 'string' ? record.won_on : ''
  if (!isIsoDate(wonOn)) return { ok: false, error: 'Won date must be YYYY-MM-DD' }
  let amountDollars: number | null
  try {
    amountDollars = parseDollars(record.amountDollars ?? record.amount)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Amount must be a dollar value' }
  }
  if (amountDollars == null) return { ok: false, error: 'Amount is required' }
  return { ok: true, value: { name, serviceType, amountDollars, wonOn } }
}
