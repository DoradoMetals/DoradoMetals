import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'

afterAll(async () => {
  await pool.end()
})

const MIGRATION_228 = fs.readFileSync(
  path.join(import.meta.dirname, '../../../../../migrations/228_one_sequence_for_every_order.sql'),
  'utf8'
)

test('a fresh refiner order and a fresh customer order draw distinct numbers from the shared sequence', async () => {
  await inPinnedTransaction(
    async (c) => {
      const { rows: refiners } = await c.query<{ id: string }>(
        'SELECT id FROM refiners.refiners ORDER BY id LIMIT 1'
      )
      const refiner_id = refiners[0]!.id
      const buyer = await aUser(c)

      const order = await anOrder(c, buyer, { direction: 'purchase' })
      const { rows } = await c.query<{ number: string }>(
        `INSERT INTO refining.orders (refiner_id, direction) VALUES ($1, 'buy') RETURNING number`,
        [refiner_id]
      )
      const refinerNumber = Number(rows[0]!.number)

      assert.notEqual(refinerNumber, order.number, 'the shared sequence handed out the same number twice')

      const { rows: dupes } = await c.query<{ n: string }>(
        `SELECT count(*) AS n FROM refining.orders ro
          WHERE ro.number = $1 AND EXISTS (SELECT 1 FROM orders.orders oo WHERE oo.number = ro.number)`,
        [refinerNumber]
      )
      assert.equal(Number(dupes[0]!.n), 0, 'the fresh refiner number already names a customer order')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('the relabelling migration draws a fresh number only for the refiner order that collides', async () => {
  await inPinnedTransaction(
    async (c) => {
      const { rows: refiners } = await c.query<{ id: string }>(
        'SELECT id FROM refiners.refiners ORDER BY id LIMIT 1'
      )
      const refiner_id = refiners[0]!.id
      const buyer = await aUser(c)
      const order = await anOrder(c, buyer, { direction: 'purchase' })

      const { rows: clean } = await c.query<{ id: string; number: string }>(
        `INSERT INTO refining.orders (refiner_id, direction, number)
         VALUES ($1, 'buy', nextval('orders.number_seq')) RETURNING id, number`,
        [refiner_id]
      )
      const { rows: colliding } = await c.query<{ id: string; number: string }>(
        `INSERT INTO refining.orders (refiner_id, direction, number)
         VALUES ($1, 'sell', $2) RETURNING id, number`,
        [refiner_id, order.number]
      )

      await c.query(MIGRATION_228)

      const { rows: after } = await c.query<{ id: string; number: string }>(
        `SELECT id, number FROM refining.orders WHERE id = ANY($1::uuid[])`,
        [[clean[0]!.id, colliding[0]!.id]]
      )
      const cleanAfter = after.find((r) => r.id === clean[0]!.id)!
      const collidingAfter = after.find((r) => r.id === colliding[0]!.id)!

      assert.equal(
        Number(cleanAfter.number),
        Number(clean[0]!.number),
        'a non-colliding refiner order was renumbered anyway'
      )
      assert.notEqual(
        Number(collidingAfter.number),
        order.number,
        'the colliding refiner order kept the number a customer order already holds'
      )
      assert.ok(
        Number(collidingAfter.number) > order.number,
        'the fresh number did not come from the shared sequence moving forward'
      )

      const { rows: dupes } = await c.query<{ n: string }>(
        `SELECT count(*) AS n FROM refining.orders ro
          WHERE EXISTS (SELECT 1 FROM orders.orders oo WHERE oo.number = ro.number)`
      )
      assert.equal(Number(dupes[0]!.n), 0, 'a collision survived the migration')

      await c.query(MIGRATION_228)
      const { rows: again } = await c.query<{ number: string }>(
        `SELECT number FROM refining.orders WHERE id = $1`,
        [colliding[0]!.id]
      )
      assert.equal(
        Number(again[0]!.number),
        Number(collidingAfter.number),
        're-running the migration moved a number that was already fixed'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})
