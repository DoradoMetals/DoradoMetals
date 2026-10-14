import type { SpotActivity, SpotSourceRead } from '@dorado/contracts'

import { capitalize, formatMoney } from '../../../_lib'
import { sourceName } from '../../_lib'

export function activityTitle(entry: SpotActivity, sources: SpotSourceRead[]): string {
  if (entry.kind === 'lock') {
    return `${entry.reference ?? 'An order'} locked at ${formatMoney(entry.bid ?? entry.ask)}`
  }
  if (entry.kind === 'unlock') return `${entry.reference ?? 'An order'} released`
  if (entry.kind === 'source') {
    return [sourceName(sources, entry.source_id), entry.event, entry.detail]
      .filter(Boolean)
      .join(' ')
  }
  const to = entry.new_value ? ` to ${entry.new_value}` : ''
  const on = entry.source_id ? ` on ${sourceName(sources, entry.source_id)}` : ''
  return `${capitalize(entry.event)}${to}${on}`
}

export const RANGE_TITLES = {
  '1D': 'today',
  '1W': 'this week',
  '1M': 'this month',
  '1Y': 'this year',
}
