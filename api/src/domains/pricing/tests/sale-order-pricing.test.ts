import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser, anOrder, aProduct, aShipment, aPayout } from '#shared/testing/builders/index.ts'
import { priceOrder } from '#pricing/service.ts'

const EXACT = 1e-9

afterAll(async () => {
  await pool.end()
})

const close = (actual: number, expected: number, what: string): void => {
  assert.ok(Math.abs(actual - expected) < EXACT, `${what} is ${actual}, hand-computed ${expected}`)
}

// A PLACED SALE WITH CREDIT AND SALES TAX. order_pricing.sql priced both
// directions with the purchase identity - items MINUS shipping MINUS a payout
// fee - so this card subtracted the shipping the customer had just paid,
// subtracted a payout fee no sale carries, and showed no tax and no credit at
// all. The sale identity is items PLUS shipping PLUS tax LESS the credit the
// balance covered.
test('a placed sale is items + shipping + sales tax - credit applied', async () => {
  await inPinnedTransaction(
    async (c) => {
      const buyer = await aUser(c)
      const product = await aProduct(c, { metal_id: 'Gold', content: 1 })

      const order = await anOrder(c, buyer, { direction: 'sale' })
        .withLines({
          metal_id: 'Gold',
          bullion_id: product.id,
          content: 1,
          premium: 1.05,
          quantity: 2,
        })
        .withSpots({ bid: 100, ask: 200 })
        .withTotals({
          items: 420,
          shipping: 19.5,
          sales_tax: 34.65,
          funds: 100,
          base_total: 474.15,
          subject_to_charges_amount: 374.15,
          post_charges_amount: 385,
          used_funds: true,
          total: 485,
        })
      await aShipment(c, order, { cost: 9.75 })
      await aPayout(c, buyer, { order, payout_fee: 12.5 })

      const quote = await priceOrder(order.id)

      assert.equal(quote.direction, 'sale')
      close(quote.items_total, 420, 'items_total')
      close(quote.shipping_charge, 19.5, 'shipping_charge - the parcel COST is not the charge')
      close(quote.sales_tax, 34.65, 'sales_tax')
      close(quote.credit_applied, 100, 'credit_applied')
      close(quote.payout_fee, 0, 'payout_fee - a sale pays nobody out')
      close(quote.total, 420 + 19.5 + 34.65 - 100, 'total due')
      close(
        quote.total,
        quote.items_total + quote.shipping_charge + quote.sales_tax - quote.credit_applied,
        'the rows the card draws do not add up to its own total'
      )
      assert.ok(quote.total > 0, 'the sale total came back negative, as the purchase form made it')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('a purchase keeps the payout identity, and reports no tax and no credit', async () => {
  await inPinnedTransaction(
    async (c) => {
      const seller = await aUser(c)
      const order = await anOrder(c, seller, { direction: 'purchase' })
        .withLines({ metal_id: 'Gold', content: 2, premium: 1, quantity: 1 })
        .withSpots({ bid: 100 })
        .withTotals({ items: 999, shipping: 999, sales_tax: 999, funds: 999 })
      await c.query(`UPDATE orders.orders SET spots_locked = true WHERE id = $1`, [order.id])
      await aShipment(c, order, { cost: 24.5 })
      await aPayout(c, seller, { order, payout_fee: 12.5 })

      const quote = await priceOrder(order.id)

      close(quote.items_total, 200, 'items_total prices the lots, never the transaction row')
      close(quote.shipping_charge, 24.5, 'shipping_charge is the parcel')
      close(quote.payout_fee, 12.5, 'payout_fee')
      close(quote.sales_tax, 0, 'a purchase collects no sales tax')
      close(quote.credit_applied, 0, 'a purchase applies no credit')
      close(quote.total, 200 - 24.5 - 12.5, 'total payout')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('a sale with no transaction row yet still prices its lots', async () => {
  await inPinnedTransaction(
    async (c) => {
      const buyer = await aUser(c)
      const product = await aProduct(c, { metal_id: 'Gold', content: 1 })
      const order = await anOrder(c, buyer, { direction: 'sale' })
        .withLines({
          metal_id: 'Gold',
          bullion_id: product.id,
          content: 1,
          premium: 1.1,
          quantity: 2,
        })
        .withSpots({ ask: 200 })
      await c.query(`UPDATE orders.orders SET spots_locked = true WHERE id = $1`, [order.id])

      const quote = await priceOrder(order.id)

      close(quote.items_total, 1 * 1.1 * 200 * 2, 'items_total fell back to the derivation')
      close(quote.sales_tax, 0, 'sales_tax came from nowhere')
      close(quote.credit_applied, 0, 'credit_applied came from nowhere')
      close(quote.total, 1 * 1.1 * 200 * 2, 'total is the goods alone')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})
