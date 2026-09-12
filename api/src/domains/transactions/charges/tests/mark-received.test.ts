import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as charges from '#transactions/charges/service.ts'
import * as payouts from '#transactions/payouts/service.ts'

afterAll(async () => {
  await pool.end()
})

async function aSale(c: PoolClient, user_id: string, owed: number): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO orders.orders (direction, number, user_id)
     VALUES ('sale', nextval('orders.sale_number_seq'), $1) RETURNING id`,
    [user_id],
    c
  )
  const id = rows[0]!.id
  await query(
    `INSERT INTO orders.transactions (order_id, total, post_charges_amount) VALUES ($1, $2, $2)`,
    [id, owed],
    c
  )
  return id
}

test('marking a charge received by hand moves Due straight to Received with a manual reference', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const order = await aSale(c, user.id, 640)
      const opened = await charges.openCharge({ order_id: order, rail: 'WIRE' })
      assert.equal(opened.state, 'Due')

      const received = await charges.patchCharge(opened.id, { reference: 'WIRE-CONF-9001' })
      assert.equal(received.state, 'Received')
      assert.equal(received.provider, 'manual')
      assert.equal(received.provider_ref, 'WIRE-CONF-9001')
      assert.equal(received.reference, 'WIRE-CONF-9001')
      assert.ok(received.completed_at)
    },
    { lock: LOCKS.ORDERS }
  )
})

test('marking an already-Received charge received again is refused - nothing moves twice', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const order = await aSale(c, user.id, 200)
      const opened = await charges.openCharge({ order_id: order, rail: 'WIRE' })
      await charges.markReceived(opened.id, 'WIRE-CONF-1')

      await assert.rejects(
        async () => await charges.markReceived(opened.id, 'WIRE-CONF-2'),
        /changed under this request|nothing was written/
      )
    },
    { lock: LOCKS.ORDERS }
  )
})

test('marking a payout received is refused - the kind guard holds', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const order = await aSale(c, user.id, 100)
      const payout = await payouts.openPayout({ order_id: order, rail: 'WIRE' })

      await assert.rejects(
        async () => await charges.markReceived(payout.id, 'WIRE-CONF-3'),
        /not a charge/
      )
    },
    { lock: LOCKS.ORDERS }
  )
})

test('a charge PATCH names exactly one field: reference, or failure_reason, never both or neither', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const order = await aSale(c, user.id, 150)
      const opened = await charges.openCharge({ order_id: order, rail: 'WIRE' })

      await assert.rejects(async () => await charges.patchCharge(opened.id, {}), /no field/)
      await assert.rejects(
        async () =>
          await charges.patchCharge(opened.id, {
            reference: 'WIRE-CONF-4',
            failure_reason: 'R01',
          }),
        /exactly one field/
      )

      const failed = await charges.patchCharge(opened.id, { failure_reason: 'R01 no funds' })
      assert.equal(failed.state, 'Failed')
      assert.equal(failed.failure_reason, 'R01 no funds')
    },
    { lock: LOCKS.ORDERS }
  )
})
