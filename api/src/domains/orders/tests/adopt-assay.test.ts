import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'
import * as orders from '#orders/service.ts'
import * as orderLots from '#db/orders/lots/repo.ts'
import * as refiningOrdersRepo from '#db/refining/orders/repo.ts'

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    'these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`'
  )
})
afterAll(async () => {
  await pool.end()
})

async function aBatchedPair(
  c: PoolClient,
  order_id: string,
  parts: { pre_melt: number; purity: number }[]
) {
  const {
    rows: [metal],
  } = await c.query(`SELECT id FROM metals.metals ORDER BY id LIMIT 1`)
  const {
    rows: [refiner],
  } = await c.query(`SELECT id FROM refiners.refiners ORDER BY id LIMIT 1`)

  const linkIds: string[] = []
  const customerLotIds: string[] = []
  for (const part of parts) {
    const {
      rows: [lot],
    } = await c.query(
      `INSERT INTO inventory.lots
         (metal_id, pre_melt, purity, quantity, unit,
          declared_pre_melt, declared_purity, declared_unit)
       VALUES ($1, $2, $3, 1, 't oz', $2, $3, 't oz')
       RETURNING id`,
      [metal.id, part.pre_melt, part.purity]
    )
    const link = await orderLots.link(order_id, lot.id, c)
    linkIds.push(link.id)
    customerLotIds.push(lot.id)
  }

  const refiningOrder = await refiningOrdersRepo.create(
    { refiner_id: refiner.id, direction: 'sell' },
    c
  )
  await c.query(`UPDATE refining.orders SET sent_at = now() WHERE id = $1`, [refiningOrder.id])

  const totalPreMelt = parts.reduce((sum, p) => sum + p.pre_melt, 0)
  const {
    rows: [refinerLot],
  } = await c.query(
    `INSERT INTO inventory.lots (metal_id, pre_melt, post_melt, purity, quantity, unit)
     VALUES ($1, $2, $3, 0.995, 1, 't oz') RETURNING id`,
    [metal.id, totalPreMelt, totalPreMelt * 0.98]
  )
  await c.query(`INSERT INTO refining.lots (refining_order_id, lot_id) VALUES ($1, $2)`, [
    refiningOrder.id,
    refinerLot.id,
  ])
  for (const customerLotId of customerLotIds) {
    await c.query(
      `INSERT INTO inventory.lot_sources (lot_id, source_lot_id, kind) VALUES ($1, $2, 'batch')`,
      [refinerLot.id, customerLotId]
    )
  }

  return { linkIds, customerLotIds, refinerLotId: refinerLot.id }
}

test('the proposal allocates a shared refiner lot pro rata by declared content', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'purchase' })
      const { linkIds } = await aBatchedPair(c, order.id, [
        { pre_melt: 10, purity: 0.9 },
        { pre_melt: 5, purity: 0.9 },
      ])

      const proposal = await orders.adoptAssayProposal(order.id)
      assert.equal(proposal.lots.length, 2, 'both batched lots should propose an adoption')

      const first = proposal.lots.find((row) => row.id === linkIds[0])!
      const second = proposal.lots.find((row) => row.id === linkIds[1])!
      assert.ok(first && second, 'both linked lots are missing from the proposal')

      assert.ok(
        Math.abs(Number(first.share) - 2 / 3) < 1e-9,
        `first share is ${first.share}, not 2/3`
      )
      assert.ok(
        Math.abs(Number(second.share) - 1 / 3) < 1e-9,
        `second share is ${second.share}, not 1/3`
      )

      const totalPostMelt = 15 * 0.98
      assert.ok(
        Math.abs(Number(first.proposed.post_melt) - totalPostMelt * (2 / 3)) < 1e-6,
        `first proposed post_melt is ${first.proposed.post_melt}`
      )
      assert.ok(
        Math.abs(Number(second.proposed.post_melt) - totalPostMelt * (1 / 3)) < 1e-6,
        `second proposed post_melt is ${second.proposed.post_melt}`
      )
      assert.equal(Number(first.proposed.purity), 0.995, 'purity is not carried unscaled')
      assert.equal(Number(second.proposed.purity), 0.995, 'purity is not carried unscaled')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('the write applies exactly what the employee confirmed, not the proposal', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'purchase' })
      const { linkIds, customerLotIds } = await aBatchedPair(c, order.id, [
        { pre_melt: 10, purity: 0.9 },
        { pre_melt: 5, purity: 0.9 },
      ])

      const proposal = await orders.adoptAssayProposal(order.id)
      const proposedFirst = proposal.lots.find((row) => row.id === linkIds[0])!
      assert.notEqual(Number(proposedFirst.proposed.post_melt), 8.8, 'fixture is not vacuous')

      const written = await orders.adoptAssay(order.id, {
        combine: false,
        lots: [
          { id: linkIds[0]!, figures: { post_melt: 8.8, purity: 0.92 } },
          { id: linkIds[1]!, figures: { post_melt: 4.7, purity: 0.92 } },
        ],
      })
      assert.equal(written.length, 2)

      const { rows } = await c.query(
        `SELECT id, post_melt, purity FROM inventory.lots
          WHERE id = ANY($1::uuid[]) ORDER BY post_melt DESC`,
        [customerLotIds]
      )
      assert.equal(Number(rows[0].post_melt), 8.8, 'the confirmed figure was not written verbatim')
      assert.equal(Number(rows[1].post_melt), 4.7, 'the confirmed figure was not written verbatim')
      assert.equal(Number(rows[0].purity), 0.92)
      assert.equal(Number(rows[1].purity), 0.92)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('combine merges the batched lots into one and re-points the batch edge', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'purchase' })
      const { linkIds } = await aBatchedPair(c, order.id, [
        { pre_melt: 10, purity: 0.9 },
        { pre_melt: 5, purity: 0.9 },
      ])

      const before = await orderLots.getFor(order.id, c)
      assert.equal(before.length, 2, 'the fixture did not link both lots to the order')

      await orders.adoptAssay(order.id, {
        combine: true,
        lots: [
          { id: linkIds[0]!, figures: { post_melt: 8.8, purity: 0.92 } },
          { id: linkIds[1]!, figures: { post_melt: 4.7, purity: 0.92 } },
        ],
      })

      const after = await orderLots.getFor(order.id, c)
      assert.equal(after.length, 1, 'combine did not collapse the order down to one lot')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})
