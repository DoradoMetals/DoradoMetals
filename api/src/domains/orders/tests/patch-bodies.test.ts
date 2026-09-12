import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import {
  OrderLotPatch,
  OrderPatch,
  PaymentDetailsPatch,
  RefinerItemPatch,
  RefinerOrderPatch,
  ShipmentChargeBody,
  ShipmentPatch,
} from '@dorado/contracts'

afterAll(async () => {
  await pool.end()
})

test('the shipment charge action refuses a null shipping charge, by name', () => {
  refusesField(ShipmentChargeBody, { shipping_charge: null }, 'shipping_charge')
  assert.equal(ShipmentChargeBody.safeParse({ shipping_charge: 0 }).success, true)
  assert.equal(ShipmentChargeBody.safeParse({ shipping_charge: 45.67 }).success, true)
})

test('the shipment PATCH takes only carrier_service_id now that charge, actual cost and tracking are actions', () => {
  assert.equal(
    ShipmentPatch.safeParse({
      carrier_service_id: '00000000-0000-4000-8000-000000000000',
    }).success,
    true
  )
  refusesField(ShipmentPatch, { shipping_charge: 1 }, 'shipping_charge')
  refusesField(ShipmentPatch, { shipping_actual: 1 }, 'shipping_actual')
  refusesField(ShipmentPatch, { tracking_number: 'TRK-1' }, 'tracking_number')
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

test('the order PATCH is notes, assigned_to_id, cancelled_at and review_created - status is gone (ruling 112) and the four actions are not among them', () => {
  assert.equal(OrderPatch.safeParse({ notes: 'left on the porch' }).success, true)
  assert.equal(OrderPatch.safeParse({ notes: null }).success, true)
  assert.equal(
    OrderPatch.safeParse({ assigned_to_id: '00000000-0000-4000-8000-000000000000' }).success,
    true
  )
  assert.equal(OrderPatch.safeParse({ assigned_to_id: null }).success, true)
  assert.equal(OrderPatch.safeParse({ cancelled_at: null }).success, true)
  assert.equal(OrderPatch.safeParse({ review_created: true }).success, true)
  refusesField(OrderPatch, { status: 'Received' }, 'status')
  for (const action of ['add_funds', 'finalize', 'cancel', 'supplier']) {
    refusesField(OrderPatch, { [action]: true }, action)
  }
})

test('a lot PATCH confirms with a timestamp, clears with a null, and has no `reset`', () => {
  assert.equal(OrderLotPatch.safeParse({ confirmed_at: new Date().toISOString() }).success, true)
  assert.equal(OrderLotPatch.safeParse({ confirmed_at: null }).success, true)
  refusesField(OrderLotPatch, { confirmed: true }, 'confirmed')
  refusesField(OrderLotPatch, { reset: true }, 'reset')
})

test('a lot PATCH writes only what it names, so a partial is legal', () => {
  assert.equal(OrderLotPatch.safeParse({ premium: 1.02 }).success, true)
  assert.equal(OrderLotPatch.safeParse({ quantity: 2 }).success, true)
  assert.equal(OrderLotPatch.safeParse({ quantity: 2, premium: 1.02 }).success, true)
  assert.equal(OrderLotPatch.safeParse({ premium: null, sales_tax_rate: null }).success, true)
})

test('a lot PATCH is flat, and neither price nor content is a field', () => {
  assert.equal(
    OrderLotPatch.safeParse({ pre_melt: 3, post_melt: 2.8, purity: 0.585, unit: 'g' }).success,
    true
  )
  refusesField(OrderLotPatch, { scrap: { premium: 0.9, scrap: { pre_melt: 3 } } }, 'scrap')
  refusesField(OrderLotPatch, { bullion: { quantity: 2, premium: 1.02 } }, 'bullion')
  refusesField(OrderLotPatch, { content: 4 }, 'content')
  refusesField(OrderLotPatch, { price: 100 }, 'price')
  refusesField(OrderLotPatch, { sales_tax_charged: 0.06 }, 'sales_tax_charged')
  refusesField(OrderLotPatch, { purity_actual: 0.5 }, 'purity_actual')
})

test('a payout PATCH takes the waive flag both ways, and refuses a non-boolean', () => {
  assert.equal(PaymentDetailsPatch.safeParse({ waive_payout_fee: true }).success, true)
  assert.equal(PaymentDetailsPatch.safeParse({ waive_payout_fee: false }).success, true)
  refusesField(PaymentDetailsPatch, { waive_payout_fee: 'yes' }, 'waive_payout_fee')
  assert.equal(PaymentDetailsPatch.safeParse({ cost: 125 }).success, true)
})

test('an unknown field is refused by name on every one of the six', () => {
  refusesField(OrderPatch, { nope: 1 }, 'nope')
  refusesField(OrderLotPatch, { nope: 1 }, 'nope')
  refusesField(ShipmentPatch, { nope: 1 }, 'nope')
  refusesField(RefinerOrderPatch, { nope: 1 }, 'nope')
  refusesField(RefinerItemPatch, { nope: 1 }, 'nope')
  refusesField(PaymentDetailsPatch, { nope: 1 }, 'nope')

  refusesField(RefinerItemPatch, { content: 1 }, 'content')
})
