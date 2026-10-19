import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'

afterAll(async () => {
  await pool.end()
})

const inRollback = rollbackIn({ lock: [LOCKS.ORDERS, LOCKS.ADDRESSES] })
const MIGRATION = fs.readFileSync(
  new URL('../../../../migrations/299_a_dollar_amount_is_held_to_the_cent.sql', import.meta.url),
  'utf8'
)

test('299 rounds float residue in a dollar column to the cent, and a second run changes nothing', async () => {
  await inRollback(async (c: PoolClient) => {
    const owner = await aUser(c)
    const order = await anOrder(c, owner, { direction: 'purchase' }).withLots(1)
    await c.query(
      `INSERT INTO orders.transactions (order_id, total, items) VALUES ($1, 7085.990000000001, 12.345)`,
      [order.id]
    )
    await c.query(MIGRATION)
    const { rows } = await c.query(
      `SELECT total::text, items::text FROM orders.transactions WHERE order_id = $1`,
      [order.id]
    )
    assert.equal(rows[0].total, '7085.99')
    assert.equal(rows[0].items, '12.35')

    const again = await c.query(
      `UPDATE orders.transactions SET total = round(total, 2) WHERE total <> round(total, 2)`
    )
    assert.equal(again.rowCount, 0, 'a rounded total is matched by no statement')
    await c.query(MIGRATION)
    const after = await c.query(`SELECT total::text FROM orders.transactions WHERE order_id = $1`, [
      order.id,
    ])
    assert.equal(after.rows[0].total, '7085.99')
  })
})
