import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anOrder, aProduct } from '#shared/testing/builders/index.ts'
import * as lotsRepo from '#db/lots/items/repo.ts'

await mockSessions()
const { default: app } = await import('#app')

const admin = TEST_ACTOR

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inInventory = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS })

test('every inventory route is admin-only, and a signed-out caller is refused outright', async () => {
  await inInventory(async () => {
    await anonymous(async () => {
      for (const [verb, url] of [
        ['get', '/api/lots'],
        ['get', '/api/inventory/summary'],
        ['post', '/api/lots/combine'],
      ] as const) {
        const res = await request(app)[verb](url)
        assert.equal(res.status, 401, `${verb} ${url} answered ${res.status}`)
      }
    })
  })
})

test('GET /api/lots filters by position, metal, kind, order and search', async () => {
  await inInventory(async (c) => {
    await asAdmin(admin, async () => {
      const onHand = await lotsRepo.create({ metal_id: 'Gold', pre_melt: 5, purity: 0.9 }, c)
      const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1, {
        metal_id: 'Silver',
        pre_melt: 8,
        purity: 0.8,
      })

      const onHandRes = await request(app).get('/api/lots').query({ position: 'on hand' })
      assert.equal(onHandRes.status, 200, onHandRes.text)
      assert.ok(
        onHandRes.body.some((row: { id: string }) => row.id === onHand.id),
        'the on-hand lot was not returned'
      )
      assert.ok(
        onHandRes.body.every((row: { position: string }) => row.position === 'on hand'),
        'a non on-hand lot leaked through the position filter'
      )

      const incomingRes = await request(app)
        .get('/api/lots')
        .query({ position: 'incoming' })
      assert.ok(incomingRes.body.some((row: { id: string }) => row.id === order.lots[0]!.lot_id))

      const repeated = await request(app)
        .get('/api/lots')
        .query({ position: ['on hand', 'incoming'] })
      assert.ok(repeated.body.some((row: { id: string }) => row.id === onHand.id))
      assert.ok(repeated.body.some((row: { id: string }) => row.id === order.lots[0]!.lot_id))

      const badPosition = await request(app).get('/api/lots').query({ position: 'melted' })
      assert.equal(badPosition.status, 400, `answered ${badPosition.status}`)

      const metalRes = await request(app).get('/api/lots').query({ metal_id: 'Gold' })
      assert.ok(metalRes.body.every((row: { metal_id: string }) => row.metal_id === 'Gold'))

      const scrapRes = await request(app).get('/api/lots').query({ kind: 'scrap' })
      assert.ok(scrapRes.body.every((row: { bullion_id: string | null }) => row.bullion_id === null))

      const badKind = await request(app).get('/api/lots').query({ kind: 'coin' })
      assert.equal(badKind.status, 400, `answered ${badKind.status}`)

      const orderRes = await request(app).get('/api/lots').query({ order_id: order.id })
      assert.equal(orderRes.body.length, 1)
      assert.equal(orderRes.body[0].order_id, order.id)

      const qRes = await request(app).get('/api/lots').query({ q: order.number.toString() })
      assert.ok(qRes.body.some((row: { id: string }) => row.id === order.lots[0]!.lot_id))
    })
  })
})

test('GET /api/lots/:id returns the five cards, and an unknown id is a 404', async () => {
  await inInventory(async (c) => {
    await asAdmin(admin, async () => {
      const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1, {
        metal_id: 'Gold',
        pre_melt: 10,
        purity: 0.9,
      })
      const lot_id = order.lots[0]!.lot_id

      const res = await request(app).get(`/api/lots/${lot_id}`)
      assert.equal(res.status, 200, res.text)
      assert.equal(res.body.lot.id, lot_id)
      assert.equal(res.body.lot.position, 'incoming')
      assert.equal(res.body.where.order.id, order.id)
      assert.equal(res.body.where.refining_order, null)
      assert.ok('declared_content' in res.body.worth)
      assert.deepEqual(res.body.lineage.children, [])
      assert.equal(res.body.lineage.split_from_id, null)
      assert.ok(Array.isArray(res.body.timeline))

      const missing = await request(app).get(
        '/api/lots/00000000-0000-4000-8000-000000000000'
      )
      assert.equal(missing.status, 404, `answered ${missing.status}`)
    })
  })
})

test('GET /api/lots/:id shows a split parent as consumed, with its children in lineage', async () => {
  await inInventory(async (c) => {
    await asAdmin(admin, async () => {
      const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1, {
        metal_id: 'Silver',
        pre_melt: 20,
        purity: 0.9,
      })
      const parent_id = order.lots[0]!.lot_id
      const orderLotId = order.lots[0]!.id

      const split = await request(app)
        .post(`/api/orders/lots/${orderLotId}/split`)
        .send({ parts: [{ pre_melt: 12, purity: 0.9 }, { pre_melt: 8, purity: 0.9 }] })
      assert.equal(split.status, 201, split.text)

      const parentView = await request(app).get(`/api/lots/${parent_id}`)
      assert.equal(parentView.status, 200, parentView.text)
      assert.equal(parentView.body.lot.position, 'consumed')
      assert.equal(parentView.body.lineage.children.length, 2)
    })
  })
})

test('POST /api/lots/combine merges on-hand lots and refuses a mismatched set', async () => {
  await inInventory(async (c) => {
    await asAdmin(admin, async () => {
      const a = await lotsRepo.create({ metal_id: 'Gold', pre_melt: 10, purity: 0.9 }, c)
      const b = await lotsRepo.create({ metal_id: 'Gold', pre_melt: 20, purity: 0.5 }, c)

      const combined = await request(app).post('/api/lots/combine').send({ lot_ids: [a.id, b.id] })
      assert.equal(combined.status, 201, combined.text)
      assert.equal(combined.body.metal_id, 'Gold')
      assert.equal(combined.body.position, 'on hand')
      assert.ok(
        Math.abs(Number(combined.body.content) - (Number(a.content) + Number(b.content))) < 1e-6
      )

      const alreadyCombined = await request(app)
        .post('/api/lots/combine')
        .send({ lot_ids: [a.id, b.id] })
      assert.equal(alreadyCombined.status, 422, `answered ${alreadyCombined.status}`)

      const differentMetal = await lotsRepo.create(
        { metal_id: 'Silver', pre_melt: 10, purity: 0.9 },
        c
      )
      const anotherGold = await lotsRepo.create({ metal_id: 'Gold', pre_melt: 10, purity: 0.9 }, c)
      const mismatch = await request(app)
        .post('/api/lots/combine')
        .send({ lot_ids: [differentMetal.id, anotherGold.id] })
      assert.equal(mismatch.status, 422, `answered ${mismatch.status}`)
      assert.match(mismatch.body?.error?.message ?? '', /share a metal/)

      const catalogue = await aProduct(c, { metal_id: 'Gold' })
      const bullionLot = await lotsRepo.createFromProduct(catalogue.id, 1, false, c)
      assert.ok(bullionLot)
      const scrapVsBullion = await request(app)
        .post('/api/lots/combine')
        .send({ lot_ids: [anotherGold.id, bullionLot!.id] })
      assert.equal(scrapVsBullion.status, 422, `answered ${scrapVsBullion.status}`)

      const tooFew = await request(app).post('/api/lots/combine').send({ lot_ids: [a.id] })
      assert.equal(tooFew.status, 400, `answered ${tooFew.status}`)
    })
  })
})

test('POST /api/lots/combine refuses a lot that is not on hand', async () => {
  await inInventory(async (c) => {
    await asAdmin(admin, async () => {
      const soldOrder = await anOrder(c, await aUser(c), { direction: 'sale' }).withLots(1, {
        metal_id: 'Gold',
        pre_melt: 5,
        purity: 0.9,
      })
      const onHand = await lotsRepo.create({ metal_id: 'Gold', pre_melt: 5, purity: 0.9 }, c)

      const res = await request(app)
        .post('/api/lots/combine')
        .send({ lot_ids: [soldOrder.lots[0]!.lot_id, onHand.id] })
      assert.equal(res.status, 422, `answered ${res.status}`)
      assert.match(res.body?.error?.message ?? '', /not on hand/)
    })
  })
})

test('GET /api/inventory/summary returns every metal, zeroes included, and the pool balances', async () => {
  await inInventory(async () => {
    await asAdmin(admin, async () => {
      const res = await request(app).get('/api/inventory/summary')
      assert.equal(res.status, 200, res.text)
      assert.ok(Array.isArray(res.body.metals))
      assert.ok(res.body.metals.length >= 4, 'not every metal came back')
      assert.ok(
        res.body.metals.every(
          (m: { on_hand_lots: number; on_hand_content: number }) =>
            typeof m.on_hand_lots === 'number' && typeof m.on_hand_content === 'number'
        )
      )
      assert.ok(Array.isArray(res.body.pool))
    })
  })
})
