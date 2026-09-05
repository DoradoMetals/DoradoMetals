import { test } from 'vitest'
import assert from 'node:assert/strict'
import { CheckoutItemPatch } from '@dorado/contracts'

const parse = (line: unknown) => CheckoutItemPatch.safeParse(line)

test('a bullion line is a product and a quantity, and nothing else', () => {
  assert.equal(parse({ bullion_id: crypto.randomUUID(), quantity: 2 }).success, true)
  assert.equal(parse({ bullion_id: crypto.randomUUID() }).success, true)
})

test('a bullion line carrying weights is refused', () => {
  const bullion_id = crypto.randomUUID()
  for (const weights of [
    { purity: 0.999 },
    { pre_melt: 1 },
    { post_melt: 1 },
    { unit: 't oz' },
    { metal_id: 'Gold' },
  ]) {
    assert.equal(
      parse({ bullion_id, quantity: 1, ...weights }).success,
      false,
      `a bullion line carrying ${Object.keys(weights)[0]} parsed`
    )
  }
})

test('a scrap line declares its metal, weight, purity and unit', () => {
  assert.equal(
    parse({ metal_id: 'Gold', pre_melt: 8, purity: 0.5, unit: 'g', quantity: 1 }).success,
    true
  )
  assert.equal(
    parse({
      metal_id: 'Gold',
      pre_melt: 8,
      post_melt: 7,
      purity: 0.5,
      unit: 'g',
      quantity: 1,
    }).success,
    true
  )
})

test('a scrap line without a metal is refused, and so is one missing any other value', () => {
  const complete = { metal_id: 'Gold', pre_melt: 8, purity: 0.5, unit: 'g', quantity: 1 }
  for (const missing of ['metal_id', 'pre_melt', 'purity', 'unit'] as const) {
    const line: Record<string, unknown> = { ...complete }
    delete line[missing]
    assert.equal(parse(line).success, false, `a scrap line with no ${missing} parsed`)
  }
  assert.equal(parse({ ...complete, metal_id: null }).success, false, 'a null metal parsed')
})

test('a line naming neither a product nor a metal is refused', () => {
  assert.equal(parse({ quantity: 1 }).success, false)
  assert.equal(parse({}).success, false)
})
