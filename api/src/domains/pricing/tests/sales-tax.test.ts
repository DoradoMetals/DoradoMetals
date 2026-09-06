import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import * as pricing from '#pricing/index.ts'
import * as taxService from '#pricing/sales-tax/service.ts'
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

// MP F3, PINNED AS FOUND, NOT FIXED. Which half is wrong is Jacob's call
// (README "Decisions that are Jacob's before the fix"), so this test records
// today's behaviour rather than asserting a correct one.
//
// The quote suppresses tax only when COLLECTING_NEXUS_TAXES is 'true', and
// api/.env and .env.example both set it to false - so tax is charged wherever a
// tax.sales_tax_rules row matches, nexus or not. `sales-tax/sql/accrue.sql`
// does the exact opposite in the same request: `WHERE state = $2 AND
// reached_nexus = true`. Every one of the 51 tax.sales_tax rows on both
// databases has reached_nexus = false, so every sales-tax dollar the API
// collects today is recorded as owed to nobody. When this test starts failing,
// the decision has been made; change it deliberately.
test('FINDING MP F3: tax is charged where nexus is false, and accrued nowhere', async () => {
  const rule = await chargingRule()
  assert.ok(rule, 'dev has no gold/coin sales-tax rule that charges - this would prove nothing')
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { rows: nexus } = await c.query(
        `SELECT reached_nexus FROM tax.sales_tax WHERE state::text = $1`,
        [rule.state]
      )
      assert.equal(
        nexus[0]?.reached_nexus,
        false,
        `${rule.state} has reached nexus - pick another state or this proves nothing`
      )

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
      assert.ok(
        q.sales_tax > 0,
        'tax is no longer charged where nexus is false - the decision was taken'
      )

      const owedBefore = (
        await c.query(`SELECT amount_owed FROM tax.sales_tax WHERE state::text = $1`, [rule.state])
      ).rows[0]
      await taxService.updateStateSalesTax(q.sales_tax, rule.state, c)
      const owedAfter = (
        await c.query(`SELECT amount_owed FROM tax.sales_tax WHERE state::text = $1`, [rule.state])
      ).rows[0]

      assert.equal(
        Number(owedAfter.amount_owed),
        Number(owedBefore.amount_owed),
        'the accrual now records the tax the quote charged - the decision was taken'
      )
    },
    { actor: TEST_ACTOR.id, lock: SALE_LOCKS }
  )
})
