import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser, aProduct, anOrder } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

type UserFixture = { id: string; name: string | null; email: string | null }
type ItemFixture = { id: string; order_id: string; lot_id: string }
type ScrapItemFixture = ItemFixture

const admin: UserFixture = TEST_ACTOR

const lines = async (c: PoolClient) => {
  const customer = await aUser(c)
  const product = await aProduct(c)
  const order = await anOrder(c, customer, { direction: 'purchase', status: 'Pending' })
    .withBullion(product, 1)
    .withLots(1, { metal_id: 'Gold', pre_melt: 10, purity: 0.585 })
    .withSpots()
  return {
    item: { id: order.lots[0]!.id, order_id: order.id, lot_id: order.lots[0]!.lot_id },
    scrapItem: { id: order.lots[1]!.id, order_id: order.id, lot_id: order.lots[1]!.lot_id },
  }
}

const refinerId = async (c: PoolClient): Promise<string> => {
  const { rows } = await c.query<{ id: string }>('SELECT id FROM refiners.refiners LIMIT 1')
  return rows[0]!.id
}

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('confirmed: true confirms the line', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { item } = await lines(client)
      await asAdmin(admin, async () => {
        await client.query(`UPDATE orders.lots SET confirmed = false WHERE id = $1`, [item.id])

        const res = await request(app)
          .patch(`/api/orders/lots/${item.id}`)
          .send({ confirmed: true })

        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const { rows } = await client.query(`SELECT confirmed FROM orders.lots WHERE id = $1`, [
          item.id,
        ])
        assert.equal(rows[0].confirmed, true, 'the line was not confirmed')
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('confirmed: false unconfirms the line', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { item } = await lines(client)
      await asAdmin(admin, async () => {
        await client.query(`UPDATE orders.lots SET confirmed = true WHERE id = $1`, [item.id])

        const res = await request(app)
          .patch(`/api/orders/lots/${item.id}`)
          .send({ confirmed: false })

        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const { rows } = await client.query(`SELECT confirmed FROM orders.lots WHERE id = $1`, [
          item.id,
        ])
        assert.equal(rows[0].confirmed, false, 'the line was not reset')
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an unassigned lot names no refiner order, and an assigned one names it', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { item, scrapItem } = await lines(client)
      await asAdmin(admin, async () => {
        const before = await request(app).get(`/api/orders/${item.order_id}/lots`)
        assert.equal(before.status, 200, `answered ${before.status}`)
        assert.ok(
          before.body.every((row: { refining_order_number: number | null }) =>
            row.refining_order_number === null
          ),
          'a freshly placed lot already claims a refiner order'
        )

        const created = await request(app)
          .post('/api/refining/orders')
          .send({ refiner_id: (await refinerId(client)), direction: 'sell' })
        assert.equal(created.status, 201, `answered ${created.status}`)

        const assigned = await request(app)
          .post(`/api/refining/orders/${created.body.id}/lots`)
          .send({ lot_ids: [scrapItem.lot_id] })
        assert.equal(assigned.status, 201, `answered ${assigned.status}`)

        const after = await request(app).get(`/api/orders/${item.order_id}/lots`)
        const moved = after.body.find((row: { id: string }) => row.id === scrapItem.id)
        assert.equal(moved.refining_order_number, created.body.number)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test("the line's own columns are the body, and content is derived from them", async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { scrapItem } = await lines(client)
      await asAdmin(admin, async () => {
        const res = await request(app).patch(`/api/orders/lots/${scrapItem.id}`).send({
          premium: 0.925,
          pre_melt: 3.5,
          post_melt: 3.25,
          purity: 0.9167,
          unit: 't oz',
        })

        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const line = await client.query(
          `SELECT ol.premium, li.pre_melt, li.purity, li.content
             FROM orders.lots ol JOIN lots.items li ON li.id = ol.lot_id
            WHERE ol.id = $1`,
          [scrapItem.id]
        )
        assert.equal(Number(line.rows[0].premium), 0.925, 'the line premium did not change')
        assert.equal(Number(line.rows[0].pre_melt), 3.5, 'the scrap weight did not change')

        assert.equal(
          Number(line.rows[0].purity),
          0.9167,
          'the scrap purity was rounded - lots.items.purity has narrowed'
        )

        assert.ok(
          Math.abs(Number(line.rows[0].content) - 3.25 * 0.9167) < 1e-6,
          `content is ${line.rows[0].content}, not the derived 3.25 x 0.9167`
        )
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test("the assay columns are refused on the line's own patch", async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { scrapItem } = await lines(client)
      await asAdmin(admin, async () => {
        const res = await request(app)
          .patch(`/api/orders/lots/${scrapItem.id}`)
          .send({ purity_actual: 0.5, post_melt_actual: 3 })
        assert.equal(res.status, 400, `answered ${res.status}`)
        assert.match(res.body?.error?.message ?? '', /purity_actual/)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('DELETE removes the link and the lot together', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { scrapItem } = await lines(client)
      await asAdmin(admin, async () => {
        const res = await request(app).delete(`/api/orders/lots/${scrapItem.id}`)

        assert.equal(res.status, 204, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const link = await client.query(`SELECT 1 FROM orders.lots WHERE id = $1`, [scrapItem.id])
        assert.equal(link.rows.length, 0, 'the order link survived')

        const lot = await client.query(`SELECT 1 FROM lots.items WHERE id = $1`, [scrapItem.lot_id])
        assert.equal(lot.rows.length, 0, 'the physical lot survived its only link')
      })
    },
    { actor: TEST_ACTOR.id }
  )
})
