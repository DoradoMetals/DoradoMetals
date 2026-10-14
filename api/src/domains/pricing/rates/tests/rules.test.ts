import { test } from 'vitest'
import assert from 'node:assert/strict'
import * as rules from '#pricing/rates/rules.ts'

const band = (min_qty: number, max_qty: number | null, pct = 0.9) => ({
  min_qty,
  max_qty,
  scrap_pct: pct,
  bullion_pct: pct,
})

test('assertRate throws NotFound when the row is missing', () => {
  assert.throws(() => rules.assertRate(undefined, 'abc'), /no rate abc/)
})

test('assertRate does not throw when the row is present', () => {
  assert.doesNotThrow(() => rules.assertRate({ id: 'abc' }, 'abc'))
})

test('assertMetal refuses a metal nobody has', () => {
  assert.throws(() => rules.assertMetal(undefined, 'Tin'), /no metal Tin/)
  assert.doesNotThrow(() => rules.assertMetal({ id: 'Gold', sort_order: 1 }, 'Gold'))
})

test('assertUnit refuses a unit the weight table does not hold', () => {
  assert.throws(() => rules.assertUnit({ unit: null, bands: [] }, 'furlong'), /furlong/)
  assert.doesNotThrow(() => rules.assertUnit({ unit: 'g', bands: [] }, 'g'))
})

test('contiguous bands from 0 with an open last band pass', () => {
  assert.doesNotThrow(() => rules.assertBands([band(0, 5), band(5, 20), band(20, null)]))
  assert.doesNotThrow(() => rules.assertBands([band(0, null)]))
})

test('the band rules refuse each malformed list', () => {
  assert.throws(() => rules.assertBands([]), /at least one band/)
  assert.throws(() => rules.assertBands([band(1, null)]), /must start at 0/)
  assert.throws(() => rules.assertBands([band(0, 5), band(5, 10)]), /open-ended/)
  assert.throws(() => rules.assertBands([band(0, null), band(5, null)]), /not the last band/)
  assert.throws(() => rules.assertBands([band(0, 5), band(6, null)]), /no gap and no overlap/)
  assert.throws(() => rules.assertBands([band(0, 5), band(4, null)]), /no gap and no overlap/)
  assert.throws(() => rules.assertBands([band(0, 0), band(0, null)]), /at or below/)
  assert.throws(() => rules.assertBands([band(0, null, -0.1)]), /negative/)
})

test('tiers group the rows by metal and label each band', () => {
  const tiers = rules.tiers([
    {
      id: 'a',
      metal_id: 'Gold',
      unit: 'troy_oz',
      min_qty: 0,
      max_qty: 5,
      scrap_pct: 0.9,
      bullion_pct: 0.92,
    },
    {
      id: 'b',
      metal_id: 'Gold',
      unit: 'troy_oz',
      min_qty: 5,
      max_qty: null,
      scrap_pct: 0.94,
      bullion_pct: 0.96,
    },
  ])
  assert.equal(tiers.length, 1)
  assert.equal(tiers[0].bands.length, 2)
  assert.equal(tiers[0].top_pct, 0.96)
  assert.equal(tiers[0].bands[1].label, '5+ oz')
})
