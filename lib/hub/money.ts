import type { PlanSize } from '../portal/types'

/** Whole dollars. The hub does not track cents. */
export function parseDollars(value: unknown): number | null {
  if (value == null || value === '') return null
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[$,\s]/g, '')) : Number.NaN
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1_000_000) {
    throw new Error('Amount must be a dollar value from 0 to 1,000,000')
  }
  return Math.round(numeric)
}

export function isPlanSize(value: unknown): value is PlanSize {
  return value === 1 || value === 2 || value === 4
}

export function formatDollars(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatPercent(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return '—'
  return `${Math.round(rate * 100)}%`
}

export function monthlyPriceFor(
  client: { id: number; kind: string; planSize: PlanSize | null },
  planPrices: Partial<Record<PlanSize, number>>,
  clientPrices: ReadonlyMap<number, number>,
): { dollars: number | null; source: 'client' | 'plan' | 'unset' } {
  if (client.kind !== 'subscription') return { dollars: null, source: 'unset' }
  const override = clientPrices.get(client.id)
  if (override != null) return { dollars: override, source: 'client' }
  if (client.planSize != null && planPrices[client.planSize] != null) {
    return { dollars: planPrices[client.planSize] ?? null, source: 'plan' }
  }
  return { dollars: null, source: 'unset' }
}
