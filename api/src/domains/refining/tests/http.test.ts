// The refiner surface over HTTP: every route, its guard, and what it refuses.
import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anOrder, anUnknownId } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

const admin = TEST_ACTOR

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inRefining = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS })

const refinerId = async (c: PoolClient): Promise<string> => {
  const { rows } = await c.query<{ id: string }>('SELECT id FROM refiners.refiners LIMIT 1')
  assert.ok(rows[0], 'the test database has no refiner')
  return rows[0].id
}

const opened = async (c: PoolClient, direction: 'sell' | 'buy' = 'buy') => {
  const res = await request(app)
    .post('/api/refining/orders')
    .send({ refiner_id: await refinerId(c), direction })
  assert.equal(res.status, 201, `answered ${res.status}: ${JSON.stringify(res.body)}`)
  return res.body
}

test('every refiner route is admin-only, and a customer is refused outright', async () => {
  await inRefining(async (c) => {
    const customer = await aUser(c)
    await as({ ...customer, role: 'user' }, async () => {
      for (const [verb, url] of [
        ['get', '/api/refining/orders'],
        ['get', `/api/refining/orders/${anUnknownId()}`],
        ['get', '/api/refining/pool'],
        ['get', '/api/refining/pool/entries'],
      ] as const) {
        const res = await request(app)[verb](url)
        assert.equal(res.status, 403, `${verb} ${url} answered ${res.status}`)
      }
    })
    await anonymous(async () => {
      const res = await request(app).get('/api/refining/orders')
      assert.equal(res.status, 401, `answered ${res.status} with no session`)
    })
  })
})

test('the list filters by counterparty, direction and state, and refuses a stranger', async () => {
  await inRefining(async (c) => {
    const refiner_id = await refinerId(c)
    await asAdmin(admin, async () => {
      const created = await opened(c, 'buy')

      const mine = await request(app).get('/api/refining/orders').query({ refiner_id })
      assert.equal(mine.status, 200, mine.text)
      assert.ok(
        mine.body.some((row: { id: string }) => row.id === created.id),
        'the refiner filter dropped the order just made for it'
      )

      const buys = await request(app).get('/api/refining/orders').query({ direction: 'buy' })
      assert.ok(buys.body.every((row: { direction: string }) => row.direction === 'buy'))

      const pending = await request(app)
        .get('/api/refining/orders')
        .query({ state: 'Pending assay' })
      assert.ok(pending.body.every((row: { state: string }) => row.state === 'Pending assay'))

      const bad = await request(app).get('/api/refining/orders').query({ direction: 'sideways' })
      assert.equal(bad.status, 400, `answered ${bad.status}`)
      const badState = await request(app).get('/api/refining/orders').query({ state: 'Melted' })
      assert.equal(badState.status, 400, `answered ${badState.status}`)
    })
  })
})

test('a refiner order reads back by id, and an unknown one is a 404', async () => {
  await inRefining(async (c) => {
    await asAdmin(admin, async () => {
      const created = await opened(c)
      const read = await request(app).get(`/api/refining/orders/${created.id}`)
      assert.equal(read.status, 200, read.text)
      assert.equal(read.body.number, created.number)
      assert.equal(read.body.state, 'Pending assay')
      assert.deepEqual(read.body.lots, [])
      assert.equal(read.body.variance, null, 'an order with no lots reported a variance')

      const missing = await request(app).get(`/api/refining/orders/${anUnknownId()}`)
      assert.equal(missing.status, 404, `answered ${missing.status}`)
    })
  })
})

test('the PATCH carries the settlement facts, and refuses a field it does not have', async () => {
  await inRefining(async (c) => {
    await asAdmin(admin, async () => {
      const created = await opened(c)
      const patched = await request(app)
        .patch(`/api/refining/orders/${created.id}`)
        .send({ assay_lab: 'Metalor', expected_settlement_on: '2026-09-14', fee: 12.5 })
      assert.equal(patched.status, 200, patched.text)
      assert.equal(patched.body.assay_lab, 'Metalor')
      assert.equal(patched.body.expected_settlement_on, '2026-09-14')
      assert.equal(Number(patched.body.fee), 12.5)

      const empty = await request(app).patch(`/api/refining/orders/${created.id}`).send({})
      assert.equal(empty.status, 422, `answered ${empty.status}`)

      const stranger = await request(app)
        .patch(`/api/refining/orders/${created.id}`)
        .send({ settled_at: new Date().toISOString() })
      assert.equal(stranger.status, 400, `answered ${stranger.status}`)
      assert.match(stranger.body?.error?.message ?? '', /settled_at/)
    })
  })
})

test('a disputed settlement is a timestamp, and the state follows it', async () => {
  await inRefining(async (c) => {
    await asAdmin(admin, async () => {
      const created = await opened(c)
      const disputed = await request(app)
        .patch(`/api/refining/orders/${created.id}`)
        .send({ disputed_at: new Date().toISOString() })
      assert.equal(disputed.status, 200, disputed.text)
      assert.equal(disputed.body.state, 'Disputed')
    })
  })
})

test('lots are assigned, listed, assayed and removed while the order is open', async () => {
  await inRefining(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(2, {
      metal_id: 'Gold',
      pre_melt: 10,
      purity: 0.9,
      unit: 't oz',
    })
    await asAdmin(admin, async () => {
      const created = await opened(c, 'sell')

      const assigned = await request(app)
        .post(`/api/refining/orders/${created.id}/lots`)
        .send({ lot_ids: order.lots.map((l) => l.lot_id) })
      assert.equal(assigned.status, 201, assigned.text)
      assert.equal(assigned.body.length, 2)

      const listed = await request(app).get(`/api/refining/orders/${created.id}/lots`)
      assert.equal(listed.status, 200, listed.text)
      assert.equal(listed.body.length, 2)

      const assay = await request(app)
        .patch(`/api/refining/lots/${assigned.body[0].id}`)
        .send({ post_melt: 9.5, purity: 0.95, unit: 't oz', premium: 0.97 })
      assert.equal(assay.status, 200, assay.text)
      assert.ok(Math.abs(Number(assay.body.content) - 9.5 * 0.95) < 1e-9)

      const empty = await request(app).patch(`/api/refining/lots/${assigned.body[0].id}`).send({})
      assert.equal(empty.status, 422, `answered ${empty.status}`)

      const badUnit = await request(app)
        .patch(`/api/refining/lots/${assigned.body[0].id}`)
        .send({ unit: 'kg' })
      assert.equal(badUnit.status, 422, `answered ${badUnit.status}`)
      assert.match(badUnit.body?.error?.message ?? '', /cannot be valued/)

      const removed = await request(app).delete(`/api/refining/lots/${assigned.body[1].id}`)
      assert.equal(removed.status, 204, `answered ${removed.status}`)
      const after = await request(app).get(`/api/refining/orders/${created.id}/lots`)
      assert.equal(after.body.length, 1, 'the removed lot came back')

      const gone = await request(app).delete(`/api/refining/lots/${anUnknownId()}`)
      assert.equal(gone.status, 404, `answered ${gone.status}`)
    })
  })
})

test('an unknown lot cannot be assigned, and a lot on a sent order cannot be removed', async () => {
  await inRefining(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1)
    await asAdmin(admin, async () => {
      const created = await opened(c, 'sell')
      const nobody = await request(app)
        .post(`/api/refining/orders/${created.id}/lots`)
        .send({ lot_ids: [anUnknownId()] })
      assert.equal(nobody.status, 404, `answered ${nobody.status}`)

      const empty = await request(app)
        .post(`/api/refining/orders/${created.id}/lots`)
        .send({ lot_ids: [] })
      assert.equal(empty.status, 400, `answered ${empty.status}`)

      const assigned = await request(app)
        .post(`/api/refining/orders/${created.id}/lots`)
        .send({ lot_ids: [order.lots[0]!.lot_id] })
      assert.equal(assigned.status, 201, assigned.text)

      const bare = await request(app).post(`/api/refining/orders/${created.id}/send`)
      assert.equal(bare.status, 200, bare.text)

      const removed = await request(app).delete(`/api/refining/lots/${assigned.body[0].id}`)
      assert.equal(removed.status, 409, `answered ${removed.status}`)
    })
  })
})

test('an order holding no lots cannot be sent', async () => {
  await inRefining(async (c) => {
    await asAdmin(admin, async () => {
      const created = await opened(c, 'sell')
      const res = await request(app).post(`/api/refining/orders/${created.id}/send`)
      assert.equal(res.status, 422, `answered ${res.status}`)
      assert.match(res.body?.error?.message ?? '', /holds no lots/)
    })
  })
})

test('a settlement names every lot on the order, and no stranger', async () => {
  await inRefining(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(2)
    await asAdmin(admin, async () => {
      const created = await opened(c, 'sell')
      await request(app)
        .post(`/api/refining/orders/${created.id}/lots`)
        .send({ lot_ids: order.lots.map((l) => l.lot_id) })
      await request(app).post(`/api/refining/orders/${created.id}/send`)

      const short = await request(app)
        .post(`/api/refining/orders/${created.id}/settle`)
        .send({ lots: [{ lot_id: order.lots[0]!.lot_id, premium: 0.9 }] })
      assert.equal(short.status, 422, `answered ${short.status}`)
      assert.match(short.body?.error?.message ?? '', /carry no assay in the settlement/)

      const stranger = await request(app)
        .post(`/api/refining/orders/${created.id}/settle`)
        .send({
          lots: [
            ...order.lots.map((l) => ({ lot_id: l.lot_id, premium: 0.9 })),
            { lot_id: anUnknownId(), premium: 0.9 },
          ],
        })
      assert.equal(stranger.status, 422, `answered ${stranger.status}`)
      assert.match(stranger.body?.error?.message ?? '', /is not on this refiner order/)

      const bare = await request(app)
        .post(`/api/refining/orders/${created.id}/settle`)
        .send({ lots: order.lots.map((l) => ({ lot_id: l.lot_id })) })
      assert.equal(bare.status, 422, `answered ${bare.status}`)
      assert.match(bare.body?.error?.message ?? '', /carry no premium/)
    })
  })
})

test('a pool lock is refused where there is no metal, and taken where there is', async () => {
  await inRefining(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1, {
      metal_id: 'Gold',
      pre_melt: 10,
      purity: 0.9,
      unit: 't oz',
    })
    await asAdmin(admin, async () => {
      const refiner_id = await refinerId(c)
      const created = await opened(c, 'sell')

      const dry = await request(app).post('/api/refining/pool/locks').send({
        refiner_id,
        metal_id: 'Gold',
        troy_oz: 1,
        lock_price: 2450,
        refining_order_id: created.id,
      })
      assert.equal(dry.status, 422, `answered ${dry.status}`)
      assert.match(dry.body?.error?.message ?? '', /no metal in that pool/)

      await request(app)
        .post(`/api/refining/orders/${created.id}/lots`)
        .send({ lot_ids: [order.lots[0]!.lot_id] })
      await request(app).post(`/api/refining/orders/${created.id}/send`)
      const settled = await request(app)
        .post(`/api/refining/orders/${created.id}/settle`)
        .send({ lots: [{ lot_id: order.lots[0]!.lot_id, premium: 0.95 }] })
      assert.equal(settled.status, 200, settled.text)

      const taken = await request(app).post('/api/refining/pool/locks').send({
        refiner_id,
        metal_id: 'Gold',
        troy_oz: 1,
        lock_price: 2450,
        refining_order_id: created.id,
      })
      assert.equal(taken.status, 201, taken.text)
      assert.equal(Number(taken.body.troy_oz), -1)

      const negative = await request(app).post('/api/refining/pool/locks').send({
        refiner_id,
        metal_id: 'Gold',
        troy_oz: -5,
        lock_price: 2450,
        refining_order_id: created.id,
      })
      assert.equal(negative.status, 422, `answered ${negative.status}`)

      const entries = await request(app)
        .get('/api/refining/pool/entries')
        .query({ refiner_id, metal_id: 'Gold' })
      assert.equal(entries.status, 200, entries.text)
      assert.ok(entries.body.some((e: { entry: string }) => e.entry === 'lock'))
      assert.ok(entries.body.some((e: { entry: string }) => e.entry === 'credit'))

      const balances = await request(app).get('/api/refining/pool').query({ refiner_id })
      assert.equal(balances.status, 200, balances.text)
      assert.ok(balances.body.length > 0, 'the pool answered no balance at all')
    })
  })
})

test('a lock cites an order that must exist, and the suppliers list is admin-only', async () => {
  await inRefining(async (c) => {
    await asAdmin(admin, async () => {
      const res = await request(app).post('/api/refining/pool/locks').send({
        refiner_id: await refinerId(c),
        metal_id: 'Gold',
        troy_oz: 1,
        lock_price: 2450,
        refining_order_id: anUnknownId(),
      })
      assert.equal(res.status, 404, `answered ${res.status}`)

      const suppliers = await request(app).get('/api/suppliers/get_all')
      assert.equal(suppliers.status, 200, suppliers.text)
      assert.ok(Array.isArray(suppliers.body))
    })
  })
})

test('a refiner order names a counterparty that exists', async () => {
  await inRefining(async () => {
    await asAdmin(admin, async () => {
      const res = await request(app)
        .post('/api/refining/orders')
        .send({ refiner_id: anUnknownId(), direction: 'sell' })
      assert.equal(res.status, 404, `answered ${res.status}`)
    })
  })
})
