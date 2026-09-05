import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import {
  OrderItemPatch,
  OrderPatch,
  PaymentDetailsPatch,
  RefinerItemPatch,
  RefinerOrderPatch,
  ShipmentPatch,
} from '@dorado/contracts'

afterAll(async () => {
  await pool.end()
})

test('a shipment PATCH refuses a null shipping charge, by name', () => {
  refusesField(ShipmentPatch, { shipping_charge: null }, 'shipping_charge')
  assert.equal(ShipmentPatch.safeParse({ shipping_charge: 0 }).success, true)
  assert.equal(ShipmentPatch.safeParse({ shipping_charge: 45.67 }).success, true)
})

test('a refiner order PATCH refuses a null on each of the three money fields', () => {
  for (const field of ['pool_oz_deducted', 'pool_remediation', 'fee']) {
    refusesField(RefinerOrderPatch, { [field]: null }, field)
    assert.equal(
      RefinerOrderPatch.safeParse({ [field]: 0 }).success,
      true,
      `${field}: 0 was refused`
    )
  }
})

test('a refiner order PATCH ACCEPTS a null refiner_id - detaching is an operation', () => {
  assert.equal(
    RefinerOrderPatch.safeParse({ refiner_id: null }).success,
    true,
    "clearing the engagement's refinery was refused"
  )
  assert.equal(
    RefinerOrderPatch.safeParse({ refiner_id: '00000000-0000-4000-8000-000000000000' }).success,
    true
  )
})

test('a refiner item PATCH keeps every one of its nulls', () => {
  for (const field of ['premium', 'pre_melt', 'post_melt', 'purity']) {
    assert.equal(
      RefinerItemPatch.safeParse({ [field]: null }).success,
      true,
      `${field}: null was refused`
    )
  }
  assert.equal(RefinerItemPatch.safeParse({ unit: null }).success, true)
})

const refusesField = (
  schema: {
    safeParse: (v: unknown) => {
      success: boolean
      error?: { issues: { message: string; path: PropertyKey[] }[] }
    }
  },
  body: unknown,
  named: string
) => {
  const parsed = schema.safeParse(body)
  assert.equal(parsed.success, false, `${named} was accepted`)
  const said = (parsed.error?.issues ?? [])
    .map((i) => `${i.path.join('.')} ${i.message}`)
    .join(' | ')
  assert.match(said, new RegExp(named), `the refusal does not name ${named}`)
}

test("the order PATCH is the row's own columns, and the four actions are not among them", () => {
  assert.equal(OrderPatch.safeParse({ status: 'Received' }).success, true)
  assert.equal(OrderPatch.safeParse({ notes: 'left on the porch' }).success, true)
  assert.equal(OrderPatch.safeParse({ notes: null }).success, true)
  for (const action of ['add_funds', 'finalize_pricing', 'cancel', 'supplier']) {
    refusesField(OrderPatch, { [action]: true }, action)
  }
})

test('an order item PATCH takes confirmed both ways, and has no `reset`', () => {
  assert.equal(OrderItemPatch.safeParse({ confirmed: true }).success, true)
  assert.equal(OrderItemPatch.safeParse({ confirmed: false }).success, true)
  refusesField(OrderItemPatch, { reset: true }, 'reset')
})

test('an order item PATCH writes only what it names, so a partial is legal', () => {
  assert.equal(OrderItemPatch.safeParse({ premium: 1.02 }).success, true)
  assert.equal(OrderItemPatch.safeParse({ quantity: 2 }).success, true)
  assert.equal(OrderItemPatch.safeParse({ quantity: 2, premium: 1.02 }).success, true)
  assert.equal(OrderItemPatch.safeParse({ quantity: null, premium: null }).success, true)
})

test('an order item PATCH is flat - the scrap and bullion documents are gone', () => {
  assert.equal(
    OrderItemPatch.safeParse({ pre_melt: 3, post_melt: 2.8, purity: 0.585, unit: 'g' }).success,
    true
  )
  refusesField(OrderItemPatch, { scrap: { premium: 0.9, scrap: { pre_melt: 3 } } }, 'scrap')
  refusesField(OrderItemPatch, { bullion: { quantity: 2, premium: 1.02 } }, 'bullion')
  refusesField(OrderItemPatch, { content: 4 }, 'content')
  refusesField(OrderItemPatch, { purity_actual: 0.5 }, 'purity_actual')
})

test('a payout PATCH takes the waive flag both ways, and refuses a non-boolean', () => {
  assert.equal(PaymentDetailsPatch.safeParse({ waive_payout_fee: true }).success, true)
  assert.equal(PaymentDetailsPatch.safeParse({ waive_payout_fee: false }).success, true)
  refusesField(PaymentDetailsPatch, { waive_payout_fee: 'yes' }, 'waive_payout_fee')
  assert.equal(PaymentDetailsPatch.safeParse({ cost: 125 }).success, true)
})

test('an unknown field is refused by name on every one of the six', () => {
  refusesField(OrderPatch, { nope: 1 }, 'nope')
  refusesField(OrderItemPatch, { nope: 1 }, 'nope')
  refusesField(ShipmentPatch, { nope: 1 }, 'nope')
  refusesField(RefinerOrderPatch, { nope: 1 }, 'nope')
  refusesField(RefinerItemPatch, { nope: 1 }, 'nope')
  refusesField(PaymentDetailsPatch, { nope: 1 }, 'nope')

  refusesField(RefinerItemPatch, { content: 1 }, 'content')
})
