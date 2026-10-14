import { describe, expect, test } from 'vitest'

import {
  adjustmentAmount,
  adjustmentExpiry,
  formatAgo,
  formatChange,
  rangeLabel,
  unitShort,
} from '../_lib'

describe('pricing formatters', () => {
  test('a change shows its sign only when asked', () => {
    expect(formatChange(-12.1, -1.24, false)).toBe('$12.10 (1.24%)')
    expect(formatChange(18.4, 0.76, true)).toBe('+$18.40 (0.76%)')
    expect(formatChange(null, null, true)).toBe('—')
  })

  test('a band reads as a range, the last one open', () => {
    expect(rangeLabel(0, 5)).toBe('0 – 5 ozt')
    expect(rangeLabel(20, null)).toBe('20+ ozt')
    expect(rangeLabel(0, 100, unitShort('g'))).toBe('0 – 100 g')
  })

  test('an adjustment reads in its own unit', () => {
    const base = { mode: 'adjust', unit: 'percent', bid_amount: -0.2, ask_amount: -0.2 }
    expect(adjustmentAmount(base)).toBe('-0.20%')
    expect(adjustmentAmount({ ...base, unit: 'dollars', bid_amount: -2.5, ask_amount: -2.5 })).toBe(
      '-$2.50'
    )
    expect(adjustmentAmount({ ...base, mode: 'freeze' })).toBe('Frozen')
    expect(adjustmentExpiry({ expires_at_market_open: true, expires_at_resolved: null })).toBe(
      'Expires at market open'
    )
  })

  test('time since a tick', () => {
    const now = Date.parse('2026-10-14T12:00:00Z')
    expect(formatAgo('2026-10-14T11:59:46Z', now)).toBe('14s ago')
    expect(formatAgo('2026-10-14T11:48:00Z', now)).toBe('12 min ago')
    expect(formatAgo(null, now)).toBe('never')
  })
})
