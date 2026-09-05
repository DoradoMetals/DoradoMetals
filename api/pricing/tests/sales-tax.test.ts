import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import * as pricing from '#pricing/index.ts'
import { inPinnedTransaction, outside } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aCart, aProduct, aUser, anAddress } from '#shared/testing/builders/index.ts'
import type { SaleQuote } from '@dorado/contracts'

const SALE_LOCKS = [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.ADDRESSES]

type Rule = {
  state: string
  tax_rate: number
  metal_category: string
  product_type: string
  purity_min: number
  purity_max: number
  weight_min: number
  weight_max: number
}

const chargingRule = async (): Promise<Rule | undefined> => {
  const rows = await outside<Rule>(
    `SELECT state_code AS state, tax_rate, metal_category, product_type,
            purity_min, purity_max, weight_min, weight_max
       FROM tax.sales_tax_rules
      WHERE tax_rate > 0 AND metal_category IN ('All', 'Gold') AND product_type IN ('All', 'Coin')
      ORDER BY tax_rate DESC, id ASC LIMIT 1`
  )
  return rows[0]
}

async function saleQuote(checkout_id: string): Promise<SaleQuote> {
  const quote = await pricing.priceCheckout(checkout_id)
  assert.equal(quote.direction, 'sale')
  return quote as SaleQuote
}

afterAll(async () => {
  await pool.end()
})

test('a basket with no delivery address is charged no tax', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const product = await aProduct(c, { metal_id: 'Gold', content: 1, gross: 1, purity: 0.999 })
      const cart = await aCart(c, await aUser(c), { direction: 'sale' }).withBullion(product, 1)
      const q = await saleQuote(cart.id)
      assert.equal(q.sales_tax, 0, 'no state matches no rule')
      assert.equal(q.sales_tax_state, null)
      assert.equal(q.base_total, q.item_total + q.shipping_charge)
    },
    { actor: TEST_ACTOR.id, lock: SALE_LOCKS }
  )
})

test("the delivery address's state is what reaches the rules, and it charges", async () => {
  const rule = await chargingRule()
  assert.ok(rule, 'dev has no gold/coin sales-tax rule that charges - this would prove nothing')
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const owner = await aUser(c)
      const address = await anAddress(c, owner, { state: rule.state })
      const purity = Math.min(Math.max(0.999, Number(rule.purity_min)), Number(rule.purity_max))
      const gross = Math.min(Math.max(1, Number(rule.weight_min)), Number(rule.weight_max))
      const product = await aProduct(c, {
        metal_id: 'Gold',
        type: 'Coin',
        content: 1,
        gross,
        purity,
      })
      const cart = await aCart(c, owner, { direction: 'sale' })
        .withBullion(product, 1)
        .withRow({ recipient_address_id: address.id })

      const q = await saleQuote(cart.id)
      assert.equal(q.sales_tax_state, rule.state)
      assert.ok(q.items[0]!.sales_tax_rate > 0, 'a real state reached the rules')
      assert.equal(
        Number(q.sales_tax.toFixed(6)),
        Number(
          (q.items[0]!.unit_ask * q.items[0]!.quantity * q.items[0]!.sales_tax_rate).toFixed(6)
        )
      )
      assert.equal(
        Number(q.base_total.toFixed(6)),
        Number((q.item_total + q.shipping_charge + q.sales_tax).toFixed(6))
      )
    },
    { actor: TEST_ACTOR.id, lock: SALE_LOCKS }
  )
})

test("the price a line is taxed on is the server's, not anything a client sent", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const [spot] = await outside<{ ask: number }>(
        `SELECT s.ask FROM spots.spots s WHERE s.metal_id = 'Gold'`
      )
      assert.ok(spot, 'dev has a gold spot')
      const product = await aProduct(c, { metal_id: 'Gold', content: 1, ask_premium: 1 })
      const cart = await aCart(c, await aUser(c), { direction: 'sale' }).withBullion(product, 1)
      const q = await saleQuote(cart.id)
      assert.equal(
        Number(q.items[0]!.unit_ask.toFixed(6)),
        Number(Number(spot.ask).toFixed(6)),
        'the quote priced from spots.spots, which no request can write'
      )
    },
    { actor: TEST_ACTOR.id, lock: SALE_LOCKS }
  )
})
