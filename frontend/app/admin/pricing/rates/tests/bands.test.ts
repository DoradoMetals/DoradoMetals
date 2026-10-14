import { describe, expect, test } from 'vitest'
import type { RatePay } from '@dorado/contracts'

import { bandCell, draftMin, lastChange, toBody, toDrafts, unitShort } from '../_lib'

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

  test('a change cell reads as the band and its rate, the side with no band as a dash', () => {
    const band = { min_qty: 20, max_qty: 50, unit: 'troy_oz', scrap_pct: 0.94, bullion_pct: 0.985 }
    expect(bandCell(band, 'bullion', unitShort)).toBe('20–50 ozt · 98.5%')
    expect(bandCell({ ...band, max_qty: null }, 'scrap', unitShort)).toBe('20+ ozt · 94%')
    expect(bandCell(null, 'scrap', unitShort)).toBe('—')
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
