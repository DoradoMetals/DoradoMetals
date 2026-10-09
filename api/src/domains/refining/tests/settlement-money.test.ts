import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anOrder, aRefiningOrder } from '#shared/testing/builders/index.ts'
import * as refiningLotsRepo from '#db/refining/lots/repo.ts'
import * as refiningOrdersRepo from '#db/refining/orders/repo.ts'
import * as lotsRepo from '#db/inventory/lots/repo.ts'
import * as fulfillmentsRepo from '#db/fulfillments/repo.ts'
import * as fulfillmentShipments from '#db/fulfillments/shipments/repo.ts'
import * as shipmentsRepo from '#db/shipping/shipments/repo.ts'
import * as pool_ from '#db/inventory/pool/repo.ts'
import { fulfillmentMethodId } from '#shared/testing/builders/reference.ts'
import type { RefiningPricingLine, SettlementLine } from '@dorado/contracts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const EXACT = 1e-6

const inRefining = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] })

async function aPaidEngagement(c: PoolClient) {
  const seller = await aUser(c)
  const order = await anOrder(c, seller, { direction: 'purchase' })
    .withLines(
      { metal_id: 'Gold', content: 2, premium: 0.9, quantity: 1 },
      { metal_id: 'Gold', content: 1, premium: 0.9, quantity: 1 }
    )
    .withSpots({ bid: 100 })
    .withTotals({ total: 270 })
  const engagement = await aRefiningOrder(c, order)
  await refiningOrdersRepo.update(engagement.id, { settlement_type: 'paid', fee: 7 }, c)
  await c.query(`UPDATE refining.orders SET sent_at = now() WHERE id = $1`, [engagement.id])
  return { order, engagement }
}

async function aRefinerParcel(c: PoolClient, refining_order_id: string, cost: number) {
  const method_id = await fulfillmentMethodId(c, 'CARRIER DROPOFF', 'purchase')
  const fulfillment = await fulfillmentsRepo.createForRefining(
    refining_order_id,
    method_id,
    'PENDING',
    c
  )
  const shipment_id = await shipmentsRepo.create(
    { direction: 'Outbound', shipping_status: 'Label Created', cost, insured: false },
    c
  )
  await fulfillmentShipments.create({ fulfillment_id: fulfillment!.id, shipment_id }, c)
}

test('the settlement lines come back with the pre-match derived in SQL', async () => {
  await inRefining(async (c) => {
    const { engagement } = await aPaidEngagement(c)
    const held = await refiningLotsRepo.getFor(engagement.id, c)
    assert.equal(held.length, 2, 'the batch did not mint one refiner lot per customer lot')

    await asAdmin(TEST_ACTOR, async () => {
      const before = await request(app).get(
        `/api/refining/orders/${engagement.id}/settlement-lines`
      )
      assert.equal(before.status, 200, before.text)
      const unmatched: SettlementLine[] = before.body
      assert.equal(unmatched.length, 2)
      for (const row of unmatched) {
        assert.equal(row.status, 'not_on_invoice', 'our lot with no line read as something else')
        assert.ok(row.matched_lot_id, 'the batch edge back to our lot was not followed')
        assert.ok(row.matched_reference?.startsWith('Lot '), 'our lot was not named')
        assert.equal(row.line_reference, null)
      }

      await request(app)
        .patch(`/api/refining/lots/${held[0]!.id}`)
        .send({ line_reference: 'ELM-88431' })
        .expect(200)

      const after = await request(app).get(`/api/refining/orders/${engagement.id}/settlement-lines`)
      const lines: SettlementLine[] = after.body
      const cited = lines.find((row) => row.line_reference === 'ELM-88431')
      assert.ok(cited, 'the line reference did not come back on the lot it was written to')
      assert.equal(cited.status, 'matched', 'a cited line with one of our lots is a match')
      assert.ok(cited.fine_oz !== null, 'a matched line carries no fine ounces')
    })
  })
})

test('a refiner lot with no lot of ours behind it is extra on the invoice', async () => {
  await inRefining(async (c) => {
    const { engagement } = await aPaidEngagement(c)
    // A line the refiner reported that we never sent (lot-model section 4.4):
    // the lot IS the refiner's, with no `batch` edge back to anything of ours,
    // so `assign` - which MINTS a refiner lot from one of our lots - is the
    // wrong path and the link is written directly.
    const stray = await lotsRepo.create({ metal_id: 'Gold', unit: 't oz', quantity: 1 }, c)
    await c.query(`INSERT INTO refining.lots (refining_order_id, lot_id) VALUES ($1, $2)`, [
      engagement.id,
      stray.id,
    ])
    const links = await refiningLotsRepo.getFor(engagement.id, c)
    const strayLink = links.find((row) => row.lot_id === stray.id)!
    await refiningLotsRepo.update(strayLink.id, { line_reference: 'ELM-99999' }, c)

    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).get(`/api/refining/orders/${engagement.id}/settlement-lines`)
      assert.equal(res.status, 200, res.text)
      const extra = (res.body as SettlementLine[]).find((row) => row.lot_id === stray.id)
      assert.ok(extra, 'the stray refiner lot is missing from the read')
      assert.equal(extra.status, 'extra_on_invoice')
      assert.equal(extra.matched_lot_id, null)
    })
  })
})

test('pricing values each refiner lot, and the lines add up to the expected settlement', async () => {
  await inRefining(async (c) => {
    const { engagement } = await aPaidEngagement(c)
    const held = await refiningLotsRepo.getFor(engagement.id, c)
    for (const link of held) {
      await refiningLotsRepo.update(link.id, { premium: 0.95, settled_spot: 120 }, c)
    }

    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app)
        .post('/api/quotes/refining_order')
        .send({ refining_order_id: engagement.id })
      assert.equal(res.status, 200, res.text)
      const lots: RefiningPricingLine[] = res.body.lots
      assert.equal(lots.length, 2, 'the quote does not carry one line per refiner lot')

      for (const line of lots) {
        assert.ok(line.reference.startsWith('RS-'), `a lot reads ${line.reference}`)
        assert.equal(line.settled_spot, 120)
        assert.ok(
          Math.abs(line.price! - line.content! * line.quantity * line.premium! * 120) < EXACT,
          'a line price is not content x quantity x premium x settled spot'
        )
      }

      const summed = lots.reduce((total, line) => total + (line.price ?? 0), 0)
      assert.ok(
        Math.abs(res.body.expected_settlement - summed) < EXACT,
        `expected_settlement ${res.body.expected_settlement} is not the sum of its lines ${summed}`
      )
    })
  })
})

test('a refiner order carries its carriage and its remediated ounces, and its total closes', async () => {
  await inRefining(async (c) => {
    const { engagement } = await aPaidEngagement(c)
    const held = await refiningLotsRepo.getFor(engagement.id, c)
    for (const link of held) {
      await refiningLotsRepo.update(link.id, { premium: 0.95, settled_spot: 120 }, c)
    }
    await aRefinerParcel(c, engagement.id, 24)
    await pool_.lock(
      {
        refiner_id: engagement.refiner_id,
        metal_id: 'Gold',
        troy_oz: 0.003,
        purpose: 'Sell to refiner',
        lock_price: 130,
        refining_order_id: engagement.id,
      },
      c
    )

    await asAdmin(TEST_ACTOR, async () => {
      const quote = await request(app)
        .post('/api/quotes/refining_order')
        .send({ refining_order_id: engagement.id })
      assert.equal(quote.status, 200, quote.text)
      assert.equal(quote.body.shipping, 24, 'the refiner leg carries no carriage')
      assert.ok(
        Math.abs(quote.body.pool_oz_remediated + 0.003) < EXACT,
        `pool_oz_remediated is ${quote.body.pool_oz_remediated}, not the signed lock ounces`
      )
      assert.ok(
        Math.abs(quote.body.pool_remediation - 0.003 * 130) < EXACT,
        'pool_remediation is not the locked ounces at their lock price'
      )

      const expected =
        quote.body.expected_settlement -
        quote.body.fee -
        quote.body.pool_remediation -
        (quote.body.payment_charge ?? 0) -
        quote.body.shipping
      assert.ok(
        Math.abs(quote.body.total - expected) < EXACT,
        `total ${quote.body.total} does not close over its own terms (${expected})`
      )

      const view = await request(app).get(`/api/refining/orders/${engagement.id}`)
      assert.equal(view.status, 200, view.text)
      assert.equal(view.body.totals.shipping, 24, 'the order view withheld the carriage')
      assert.ok(
        Math.abs(view.body.totals.pool_oz_remediated + 0.003) < EXACT,
        'the order view withheld the remediated ounces'
      )
      assert.equal(view.body.totals.total, quote.body.total, 'the view and pricing disagree')
    })
  })
})

test('a pooled sell order prices no lot: what it yields is ounces', async () => {
  await inRefining(async (c) => {
    const { engagement } = await aPaidEngagement(c)
    await refiningOrdersRepo.update(engagement.id, { settlement_type: 'pooled' }, c)

    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app)
        .post('/api/quotes/refining_order')
        .send({ refining_order_id: engagement.id })
      assert.equal(res.status, 200, res.text)
      assert.equal(res.body.expected_settlement, null, 'a pooled order was given a settlement')
      for (const line of res.body.lots as RefiningPricingLine[]) {
        assert.equal(line.price, null, 'a pooled lot was priced')
      }
    })
  })
})

test('Record settlement writes the refiner invoice line it was given', async () => {
  await inRefining(async (c) => {
    const { engagement } = await aPaidEngagement(c)
    const held = await refiningLotsRepo.getFor(engagement.id, c)

    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app)
        .post(`/api/refining/orders/${engagement.id}/settle`)
        .send({
          statement_reference: 'ELM-88433',
          lots: held.map((link, i) => ({
            lot_id: link.lot_id,
            premium: 0.95,
            line_reference: `ELM-8843${i}`,
          })),
        })
      assert.equal(res.status, 200, res.text)

      const lines = await request(app).get(`/api/refining/orders/${engagement.id}/settlement-lines`)
      assert.deepEqual(
        (lines.body as SettlementLine[]).map((row) => row.line_reference).sort(),
        ['ELM-88430', 'ELM-88431'],
        'the settlement did not write a line reference per lot'
      )
      for (const row of lines.body as SettlementLine[]) {
        assert.equal(row.status, 'matched', 'a settled, cited line did not read as matched')
      }
    })
  })
})
