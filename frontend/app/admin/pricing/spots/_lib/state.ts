import type { SpotTicker } from '@dorado/contracts'

export type SpotBadge = { label: string; intent: 'success' | 'danger' | 'warning' | 'info' }

export function spotBadge(spot: Pick<SpotTicker, 'state' | 'direction'>): SpotBadge | null {
  if (spot.state === 'stale') return { label: 'Stale', intent: 'warning' }
  if (spot.state === 'frozen') return { label: 'Frozen', intent: 'info' }
  if (spot.direction === 'up') return { label: 'Up', intent: 'success' }
  if (spot.direction === 'down') return { label: 'Down', intent: 'danger' }
  return null
}

export const changeTone = (value: number | null | undefined): string | undefined => {
  if (value == null || value === 0) return undefined
  return value > 0 ? 'text-success' : 'text-destructive'
}
