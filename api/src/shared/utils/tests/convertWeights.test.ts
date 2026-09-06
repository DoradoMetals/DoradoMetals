import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import type { PoolClient } from 'pg'
import { convertToPounds, convertTroyOz } from '#shared/utils/convertWeights.ts'

let client: PoolClient
beforeAll(async () => {
  client = await pool.connect()
})
afterAll(async () => {
  client?.release()
})

const fine = async (
  weight: number | null,
  unit: string | null,
  purity: number | null
): Promise<number | null> => {
  const { rows } = await client.query('SELECT metals.fine_content($1, $2, $3) AS content', [
    weight,
    unit,
    purity,
  ])
  return rows[0].content === null ? null : Number(rows[0].content)
}

// MA F10. A troy ounce is 31.1034768 g and an avoirdupois pound is 453.59237 g,
// so a pound is exactly 175/12 troy ounces. The old 31.1035 / 453.592 pair
// returned LESS fine metal than the weight really is, and both the JavaScript
// and the SQL carried it, so the tests certified the loss.
test('a pound is exactly 175/12 troy ounces, not the old 14.5833105', () => {
  assert.ok(Math.abs(convertTroyOz(1, 'lb') - 175 / 12) < 1e-12)
  assert.ok(Math.abs(convertTroyOz(1, 'lb') - 14.5833105) > 1e-6)
})

test('converts each unit the business actually quotes in', () => {
  assert.equal(convertTroyOz(1, 't oz'), 1)
  assert.ok(Math.abs(convertTroyOz(31.1034768, 'g') - 1) < 1e-12)
  assert.equal(convertTroyOz(20, 'dwt'), 1)
})

test('matches the unit case-insensitively', () => {
  assert.equal(convertTroyOz(1, 'T OZ'), 1)
  assert.equal(convertTroyOz(20, 'DWT'), 1)
})

test('a pound of anything weighs a pound', () => {
  assert.ok(Math.abs(convertToPounds(453.59237, 'g') - 1) < 1e-12)
  assert.ok(Math.abs(convertToPounds(175 / 12, 't oz') - 1) < 1e-12)
})

// MA F4 / MP F1. The money conversion lives in `metals.fine_content` now, and
// it is the only one: a weight in a unit it does not know used to be worth
// ZERO fine ounces, persisted, on a parcel of real metal.
test('the SQL definition values every unit the business quotes in', async () => {
  assert.equal(await fine(1, 't oz', 1), 1)
  assert.equal(Number((await fine(31.1034768, 'g', 1))!.toFixed(12)), 1)
  assert.equal(await fine(20, 'dwt', 1), 1)
  assert.equal(Number((await fine(1, 'lb', 1))!.toFixed(10)), Number((175 / 12).toFixed(10)))
  assert.equal(await fine(10, 'T OZ', 0.5), 5)
})

test('an unrecognised or missing unit is refused, never valued at zero', async () => {
  for (const unit of ['kg', 'ozt', 'oz t', 'troy_oz', ' g ', '', null]) {
    await assert.rejects(
      () => fine(10, unit, 0.9),
      /is not a weight this business quotes in/,
      `"${unit}" was valued rather than refused`
    )
  }
})

test('a lot with no weight or no purity has no content, and that is not an error', async () => {
  assert.equal(await fine(null, 'g', 0.9), null)
  assert.equal(await fine(10, 'g', null), null)
  assert.equal(await fine(null, null, null), null)
})
