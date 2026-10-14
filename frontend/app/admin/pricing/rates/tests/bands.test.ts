import { describe, expect, test } from 'vitest'
import type { RatePay } from '@dorado/contracts'

import { changeText, draftMin, lastChange, toBody, toDrafts } from '../_lib'

const band = (min: number, max: number | null, scrap: number, bullion: number) =>
  ({ min_qty: min, max_qty: max, scrap_pct: scrap, bullion_pct: bullion }) as RatePay

describe('rate band drafts', () => {
  test('round-trip bands through the edit form', () => {
    const drafts = toDrafts([band(0, 5, 0.9, 0.97), band(5, null, 0.92, 0.985)])
    expect(drafts).toEqual([
      { max: '5', scrap: '90.00', bullion: '97.00' },
      { max: '', scrap: '92.00', bullion: '98.50' },
    ])
    expect(draftMin(drafts, 1)).toBe('5')
    expect(toBody(drafts)).toEqual({
      bands: [
        { min_qty: 0, max_qty: 5, scrap_pct: 0.9, bullion_pct: 0.97 },
        { min_qty: 5, max_qty: null, scrap_pct: 0.92, bullion_pct: 0.985 },
      ],
    })
  })

  test('a change reads old to new', () => {
    expect(changeText({ field: 'scrap_pct', old_value: '0.89', new_value: '0.9' })).toBe(
      '89% to 90%'
    )
  })

  test('the latest edit of a metal names the card footer', () => {
    const rows = [
      { metal_id: 'Gold', updated_at: '2026-09-01T00:00:00Z' },
      { metal_id: 'Gold', updated_at: '2026-09-10T00:00:00Z' },
      { metal_id: 'Silver', updated_at: '2026-09-12T00:00:00Z' },
    ]
    expect(lastChange(rows, 'Gold')?.updated_at).toBe('2026-09-10T00:00:00Z')
  })
})
