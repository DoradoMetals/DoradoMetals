import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'
import * as lots from '#db/inventory/lots/repo.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inRefining = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS })

const refinerIds = async (c: PoolClient): Promise<string[]> => {
  const { rows } = await c.query<{ id: string }>('SELECT id FROM refiners.refiners ORDER BY id')
  assert.ok(rows[0], 'the test database has no refiner')
  return rows.map((row) => row.id)
}

const opened = async (c: PoolClient, direction: 'sell' | 'buy') => {
  const [refiner_id] = await refinerIds(c)
  const res = await request(app).post('/api/refining/orders').send({ refiner_id, direction })
  assert.equal(res.status, 201, res.text)
  return res.body as { id: string; actions: { name: string }[] }
}

const onHandLot = async (c: PoolClient) =>
  await lots.create({ metal_id: 'Gold', pre_melt: 3, purity: 0.9 }, c)

const assign = async (id: string, lot_ids: string[]) =>
  await request(app).post(`/api/refining/orders/${id}/lots`).send({ lot_ids })

test('assigning lots refuses a buy order and a lot that is not on hand', async () => {
  await inRefining(async (c) => {
    await asAdmin(TEST_ACTOR, async () => {
      const buy = await opened(c, 'buy')
      const wrongWay = await assign(buy.id, [(await onHandLot(c)).id])
      assert.equal(wrongWay.status, 422, wrongWay.text)
      assert.match(wrongWay.body?.error?.message ?? '', /buy order/)

      const sell = await opened(c, 'sell')
      const incoming = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1)
      const notHere = await assign(sell.id, [incoming.lots[0]!.lot_id])
      assert.equal(notHere.status, 422, notHere.text)
      assert.match(notHere.body?.error?.message ?? '', /not on hand/)

      const ok = await assign(sell.id, [(await onHandLot(c)).id])
      assert.equal(ok.status, 201, ok.text)
    })
  })
})

test('assigning lots refuses a cancelled order and a settled one', async () => {
  await inRefining(async (c) => {
    await asAdmin(TEST_ACTOR, async () => {
      const sell = await opened(c, 'sell')
      await c.query(
        `UPDATE refining.orders SET sent_at = now(), settled_at = now() WHERE id = $1`,
        [sell.id]
      )
      const settled = await assign(sell.id, [(await onHandLot(c)).id])
      assert.equal(settled.status, 409, settled.text)

      await c.query(
        `UPDATE refining.orders SET settled_at = NULL, cancelled_at = now() WHERE id = $1`,
        [sell.id]
      )
      const cancelled = await assign(sell.id, [(await onHandLot(c)).id])
      assert.equal(cancelled.status, 409, cancelled.text)
    })
  })
})

test('a lot cannot come off a settled order', async () => {
  await inRefining(async (c) => {
    await asAdmin(TEST_ACTOR, async () => {
      const sell = await opened(c, 'sell')
      const assigned = await assign(sell.id, [(await onHandLot(c)).id])
      assert.equal(assigned.status, 201, assigned.text)
      await c.query(
        `UPDATE refining.orders SET sent_at = now(), settled_at = now() WHERE id = $1`,
        [sell.id]
      )
      const removed = await request(app).delete(`/api/refining/lots/${assigned.body[0].id}`)
      assert.equal(removed.status, 409, removed.text)
    })
  })
})

test('PATCH refuses a settlement type after settlement and a refiner or location after send', async () => {
  await inRefining(async (c) => {
    await asAdmin(TEST_ACTOR, async () => {
      const sell = await opened(c, 'sell')
      const [first, second] = await refinerIds(c)
      await c.query(`UPDATE refining.orders SET sent_at = now() WHERE id = $1`, [sell.id])

      const fee = await request(app).patch(`/api/refining/orders/${sell.id}`).send({ fee: 12 })
      assert.equal(fee.status, 200, fee.text)
      const same = await request(app)
        .patch(`/api/refining/orders/${sell.id}`)
        .send({ refiner_id: first })
      assert.equal(same.status, 200, same.text)

      const { rows } = await c.query<{ id: string }>(`SELECT gen_random_uuid()::text AS id`)
      const location = await request(app)
        .patch(`/api/refining/orders/${sell.id}`)
        .send({ location_id: rows[0]!.id })
      assert.equal(location.status, 409, location.text)
      if (second) {
        const moved = await request(app)
          .patch(`/api/refining/orders/${sell.id}`)
          .send({ refiner_id: second })
        assert.equal(moved.status, 409, moved.text)
      }

      await c.query(`UPDATE refining.orders SET settled_at = now() WHERE id = $1`, [sell.id])
      const current = await c.query<{ settlement_type: string }>(
        `SELECT settlement_type FROM refining.orders WHERE id = $1`,
        [sell.id]
      )
      const flipped = current.rows[0]!.settlement_type === 'pooled' ? 'paid' : 'pooled'
      const type = await request(app)
        .patch(`/api/refining/orders/${sell.id}`)
        .send({ settlement_type: flipped })
      assert.equal(type.status, 409, type.text)
    })
  })
})

test('a sent refiner order is never offered dispute', async () => {
  await inRefining(async (c) => {
    await asAdmin(TEST_ACTOR, async () => {
      const sell = await opened(c, 'sell')
      await c.query(`UPDATE refining.orders SET sent_at = now() WHERE id = $1`, [sell.id])
      const read = await request(app).get(`/api/refining/orders/${sell.id}`)
      assert.equal(read.status, 200, read.text)
      const names = (read.body.actions as { name: string }[]).map((a) => a.name)
      assert.ok(names.includes('settle'))
      assert.ok(!names.includes('dispute'), 'the API offered a dispute it was ruled never to have')
    })
  })
})
