import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { aUser, anOrder, aShipment } from '#shared/testing/builders/index.ts'
import * as claims from '#db/shipping/claims/repo.ts'

afterAll(async () => {
  await pool.end()
})

const parcel = async (c: PoolClient) => {
  const customer = await aUser(c)
  const order = await anOrder(c, customer, { direction: 'purchase' }).withLots(1)
  return { order, shipment: await aShipment(c, order) }
}

test('create stamps the opener, lists by shipment and by order, and update resolves', async () => {
  await inRollback(
    async (c: PoolClient) => {
      const { order, shipment } = await parcel(c)
      const made = await claims.create(
        {
          shipment_id: shipment.id,
          kind: 'lost',
          amount: 250.5,
          carrier_claim_number: null,
          note: null,
        },
        c
      )
      assert.equal(made.status, 'Pending')
      assert.equal(made.resolved_at, null)
      assert.equal(made.created_by_id, TEST_ACTOR.id)
      assert.match(made.created_at, /Z$/)

      assert.equal((await claims.listFor(shipment.id, c)).length, 1)
      assert.deepEqual(
        (await claims.listForOrder(order.id, c)).map((r) => r.id),
        [made.id]
      )

      const done = await claims.update(
        made.id,
        { status: 'Paid', paid_amount: 200, resolved_at: new Date().toISOString() },
        c
      )
      assert.equal(done, true)
      const row = await claims.getOne(made.id, c)
      assert.equal(row?.status, 'Paid')
      assert.equal(row?.paid_amount, 200)
      assert.ok(row?.resolved_at)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})
