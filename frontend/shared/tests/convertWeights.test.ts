// Weight conversion, which exists three times.
//
// This file, `api/src/shared/utils/convertWeights.ts`, and the SQL function
// `metals.convert_to_troy_oz`. Every scrap line's content is a weight, and
// content times spot times premium is what a customer gets paid, so the three
// disagreeing is a pricing bug rather than a tidiness problem.
//
// They agree on every unit anyone uses. They disagree on units nobody does, and
// that difference is the interesting part - see the last test.
import { describe, expect, test } from 'vitest'
import { convertToPounds, convertTroyOz } from '@/shared/utils/convertWeights'

describe('convertTroyOz', () => {
  test('converts each unit the business actually quotes in', () => {
    expect(convertTroyOz(1, 't oz')).toBe(1)
    expect(convertTroyOz(31.1035, 'g')).toBeCloseTo(1, 10)
    expect(convertTroyOz(20, 'dwt')).toBe(1)
    expect(convertTroyOz(1, 'lb')).toBeCloseTo(14.5833105, 6)
  })

  // Units arrive from a dropdown, but also from data written years ago.
  test('matches the unit case-insensitively', () => {
    expect(convertTroyOz(1, 'T OZ')).toBe(1)
    expect(convertTroyOz(20, 'DWT')).toBe(1)
  })

  test('a pound is a pound, whichever way it is expressed', () => {
    // 453.592 g in a pound, 31.1035 g in a troy ounce.
    expect(convertTroyOz(453.592, 'g')).toBeCloseTo(convertTroyOz(1, 'lb'), 10)
    // 20 dwt in a troy ounce.
    expect(convertTroyOz(20 * 5, 'dwt')).toBeCloseTo(convertTroyOz(5, 't oz'), 10)
  })

  test('zero converts to zero in every unit', () => {
    for (const u of ['t oz', 'g', 'dwt', 'lb']) expect(convertTroyOz(0, u)).toBe(0)
  })

  test('NaN gives zero rather than propagating', () => {
    expect(convertTroyOz(NaN, 'g')).toBe(0)
  })

  // The one worth knowing about. An unrecognised unit returns 0 here and in the
  // API, and NULL in the SQL function - which CLAUDE.md records deliberately.
  //
  // Zero is the dangerous answer: a scrap line in a unit nobody anticipated is
  // silently worth nothing, and nothing about the result says it failed. NULL
  // at least propagates. Nothing calls the SQL function today, so this is a
  // latent difference rather than a live one, and it is pinned here so that
  // changing either copy is a deliberate act.
  test('an unknown unit is worth zero, not an error', () => {
    expect(convertTroyOz(100, 'kg')).toBe(0)
    expect(convertTroyOz(100, 'oz')).toBe(0)
    expect(convertTroyOz(100, '')).toBe(0)
  })
})

describe('convertToPounds', () => {
  test('converts each unit back to pounds', () => {
    expect(convertToPounds(453.592, 'g')).toBeCloseTo(1, 10)
    expect(convertToPounds(1, 'lb')).toBe(1)
    expect(convertToPounds(14.5833105, 't oz')).toBeCloseTo(1, 6)
  })

  // Shipping weight, so a negative or zero is meaningless rather than merely
  // unusual - it would ask a carrier to price an empty parcel.
  test('rejects a non-positive weight', () => {
    expect(convertToPounds(0, 'lb')).toBe(0)
    expect(convertToPounds(-5, 'lb')).toBe(0)
  })

  test('an unknown unit weighs nothing', () => {
    expect(convertToPounds(100, 'kg')).toBe(0)
  })

  test('round-trips against convertTroyOz', () => {
    for (const [value, unit] of [
      [500, 'g'],
      [3, 'lb'],
      [40, 'dwt'],
    ] as const) {
      const troy = convertTroyOz(value, unit)
      const pounds = convertToPounds(value, unit)
      expect(troy / pounds).toBeCloseTo(convertTroyOz(1, 'lb'), 6)
    }
  })
})
