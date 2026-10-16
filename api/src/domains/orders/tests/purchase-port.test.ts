import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aSessionRow } from '#accounts/auth/tests/harness.ts'
import * as authSessions from '#db/auth/sessions/repo.ts'
import { STEP_UP_FRESH_SECONDS } from '#accounts/auth/rules.ts'
import { aLedgerEntry, aUser, anOrder, paymentMethodId } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')
const orders = await import('#orders/service.ts')
const orderRead = await import('#orders/read.ts')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inOrders = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] })

const spotRows = async (c: PoolClient, order_id: string) =>
  (
    await c.query<{ metal_id: string; bid: number | null }>(
      'SELECT metal_id, bid FROM orders.spots WHERE order_id = $1 ORDER BY metal_id',
      [order_id]
    )
  ).rows

const lockRows = async (c: PoolClient, order_id: string) =>
  (
    await c.query<{ metal_id: string; action: string; reason: string | null }>(
      'SELECT metal_id, action, reason FROM orders.spot_locks WHERE order_id = $1 ORDER BY created_at, id',
      [order_id]
    )
  ).rows

const names = (actions: { name: string }[]) => actions.map((a) => a.name)

test('a lock covers only the metals the order holds, and a metal added later locks with a reason', async () => {
  await inOrders(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1)

    await asAdmin(TEST_ACTOR, async () => {
      const locked = await request(app).put(`/api/orders/${order.id}/spots`).send({ lock: true })
      assert.equal(locked.status, 200, locked.text)
    })

    assert.deepEqual(
      (await spotRows(c, order.id)).map((r) => r.metal_id),
      ['Gold'],
      'the lock wrote a spot row for a metal the order does not hold'
    )
    assert.deepEqual(await lockRows(c, order.id), [
      { metal_id: 'Gold', action: 'lock', reason: null },
    ])

    await orders.addLot(order.id, {
      metal_id: 'Silver',
      pre_melt: 5,
      purity: 0.999,
      unit: 't oz',
      quantity: 1,
    })

    const rows = await spotRows(c, order.id)
    assert.deepEqual(
      rows.map((r) => r.metal_id),
      ['Gold', 'Silver']
    )
    assert.ok(rows[1]!.bid !== null, 'the discovered metal was not frozen at the feed')
    assert.deepEqual(
      (await lockRows(c, order.id)).filter((e) => e.metal_id === 'Silver'),
      [{ metal_id: 'Silver', action: 'lock', reason: 'lot added' }]
    )

    await asAdmin(TEST_ACTOR, async () => {
      const log = await request(app).get(`/api/orders/${order.id}/spot_locks`)
      assert.equal(log.status, 200, log.text)
      type Event = { metal_id: string; reason: string | null; created_by_id: string | null }
      const byMetal = (metal: string) => log.body.find((e: Event) => e.metal_id === metal)
      assert.equal(log.body.length, 2)
      assert.equal(byMetal('Silver').reason, 'lot added')
      assert.equal(byMetal('Gold').created_by_id, TEST_ACTOR.id)
    })
  })
})

test('a money read refuses a locked order holding a metal with no lock', async () => {
  await inOrders(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1)
    await asAdmin(TEST_ACTOR, async () => {
      const locked = await request(app).put(`/api/orders/${order.id}/spots`).send({ lock: true })
      assert.equal(locked.status, 200, locked.text)
    })
    const {
      rows: [lot],
    } = await c.query(
      `INSERT INTO inventory.lots (metal_id, pre_melt, purity, quantity, unit)
       VALUES ('Platinum', 2, 0.95, 1, 't oz') RETURNING id`
    )
    await c.query('INSERT INTO orders.lots (order_id, lot_id) VALUES ($1, $2)', [order.id, lot.id])

    await asAdmin(TEST_ACTOR, async () => {
      const quote = await request(app).post('/api/quotes/order').send({ order_id: order.id })
      assert.equal(quote.status, 422, quote.text)
      assert.match(quote.text, /no spot lock/)
    })
  })
})

test('a frozen bid is set by hand only while locked, before finalize, with a reason', async () => {
  await inOrders(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1)
    const set = { set: [{ metal_id: 'Gold', bid: 4000 }], reason: 'customer agreed by phone' }

    const stale = await aSessionRow(c, TEST_ACTOR.id, STEP_UP_FRESH_SECONDS + 60)
    const fresh = await aSessionRow(c, TEST_ACTOR.id, 0)
    await authSessions.update(fresh, { stepped_up_at: new Date().toISOString() }, c)
    await asAdmin({ ...TEST_ACTOR, session_id: fresh }, async () => {
      const unlocked = await request(app).put(`/api/orders/${order.id}/spots`).send(set)
      assert.equal(unlocked.status, 422, unlocked.text)

      await request(app).put(`/api/orders/${order.id}/spots`).send({ lock: true })
      const bare = await request(app).put(`/api/orders/${order.id}/spots`).send({ set: set.set })
      assert.equal(bare.status, 422, bare.text)

      const written = await request(app).put(`/api/orders/${order.id}/spots`).send(set)
      assert.equal(written.status, 200, written.text)
    })

    await asAdmin({ ...TEST_ACTOR, session_id: stale }, async () => {
      const refused = await request(app).put(`/api/orders/${order.id}/spots`).send(set)
      assert.equal(refused.status, 403, refused.text)
      assert.match(refused.text, /step_up_required/)
    })

    assert.equal(Number((await spotRows(c, order.id))[0]!.bid), 4000)
    assert.deepEqual(
      (await lockRows(c, order.id)).filter((e) => e.reason !== null),
      [{ metal_id: 'Gold', action: 'lock', reason: 'customer agreed by phone' }]
    )

    await c.query('INSERT INTO orders.transactions (order_id, total) VALUES ($1, 100)', [order.id])
    await asAdmin({ ...TEST_ACTOR, session_id: fresh }, async () => {
      const finalized = await request(app).put(`/api/orders/${order.id}/spots`).send(set)
      assert.equal(finalized.status, 409, finalized.text)
    })
  })
})

test('a sale offers no lock action and refuses the spots PUT', async () => {
  await inOrders(async (c) => {
    const sale = await anOrder(c, await aUser(c), { direction: 'sale' }).withLots(1)
    const view = await orderRead.view(sale.id)
    assert.ok(view)
    const offered = names(view.actions)
    assert.ok(!offered.includes('lock_spots') && !offered.includes('unlock_spots'), offered.join())

    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).put(`/api/orders/${sale.id}/spots`).send({ lock: false })
      assert.ok(res.status >= 400 && res.status < 500, res.text)
    })
  })
})

test('a stale order or lot PATCH is refused with 409 and writes nothing', async () => {
  await inOrders(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1)
    const stale = '2000-01-01T00:00:00.000Z'

    await asAdmin(TEST_ACTOR, async () => {
      const refused = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ notes: 'stale', expected_updated_at: stale })
      assert.equal(refused.status, 409, refused.text)

      const {
        rows: [fresh],
      } = await c.query('SELECT updated_at FROM orders.orders WHERE id = $1', [order.id])
      const kept = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ notes: 'fresh', expected_updated_at: new Date(fresh.updated_at).toISOString() })
      assert.equal(kept.status, 200, kept.text)

      const lotRefused = await request(app)
        .patch(`/api/orders/lots/${order.lots[0]!.id}`)
        .send({ purity: 0.5, expected_updated_at: stale })
      assert.equal(lotRefused.status, 409, lotRefused.text)
    })

    const {
      rows: [lot],
    } = await c.query('SELECT purity FROM inventory.lots WHERE id = $1', [order.lots[0]!.lot_id])
    assert.equal(Number(lot.purity), 0.925, 'a refused lot PATCH wrote the purity')
  })
})

test('removing a lot unlinks it, keeps the inventory row and refuses one at a refiner', async () => {
  await inOrders(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(2)
    const [first, second] = order.lots

    const {
      rows: [refinerLot],
    } = await c.query(
      `INSERT INTO inventory.lots (metal_id, pre_melt, purity, quantity, unit)
       VALUES ('Gold', 10, 0.9, 1, 't oz') RETURNING id`
    )
    await c.query(
      `INSERT INTO inventory.lot_sources (lot_id, source_lot_id, kind) VALUES ($1, $2, 'batch')`,
      [refinerLot.id, second!.lot_id]
    )

    await asAdmin(TEST_ACTOR, async () => {
      const gone = await request(app).delete(`/api/orders/lots/${first!.id}`)
      assert.equal(gone.status, 404, 'a DELETE route for an order lot still exists')

      const unreasoned = await request(app).post(`/api/orders/lots/${first!.id}/unlink`).send({})
      assert.equal(unreasoned.status, 400, unreasoned.text)

      const unlinked = await request(app)
        .post(`/api/orders/lots/${first!.id}/unlink`)
        .send({ reason: 'declared twice' })
      assert.equal(unlinked.status, 200, unlinked.text)
      assert.deepEqual(
        unlinked.body.map((row: { id: string }) => row.id),
        [second!.id]
      )

      const refused = await request(app)
        .post(`/api/orders/lots/${second!.id}/unlink`)
        .send({ reason: 'probe' })
      assert.equal(refused.status, 409, refused.text)
    })

    const kept = await c.query('SELECT 1 FROM inventory.lots WHERE id = $1', [first!.lot_id])
    assert.equal(kept.rows.length, 1, 'the inventory lot was deleted')
    const {
      rows: [trail],
    } = await c.query(
      'SELECT order_id, reason, created_by_id FROM orders.lot_unlinks WHERE lot_id = $1',
      [first!.lot_id]
    )
    assert.deepEqual(trail, {
      order_id: order.id,
      reason: 'declared twice',
      created_by_id: TEST_ACTOR.id,
    })
  })
})

test('a payout splits across methods only by an explicit PUT whose amounts sum to the total', async () => {
  await inOrders(async (c) => {
    const unpriced = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1)
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' })
      .withLots(1)
      .withTotals({ total: 1000 })
    const ach = await paymentMethodId(c, 'ACH', 'purchase')
    const account = await paymentMethodId(c, 'DORADO_ACCOUNT', 'purchase')

    await asAdmin(TEST_ACTOR, async () => {
      const early = await request(app)
        .put(`/api/orders/${unpriced.id}/payout_methods`)
        .send({ methods: [] })
      assert.equal(early.status, 422, early.text)

      const one = await request(app)
        .put(`/api/orders/${order.id}/payout_methods`)
        .send({ methods: [{ method_id: ach, amount: 1000 }] })
      assert.equal(one.status, 422, one.text)

      const off = await request(app)
        .put(`/api/orders/${order.id}/payout_methods`)
        .send({
          methods: [
            { method_id: ach, amount: 600 },
            { method_id: account, amount: 399 },
          ],
        })
      assert.equal(off.status, 422, off.text)

      const split = await request(app)
        .put(`/api/orders/${order.id}/payout_methods`)
        .send({
          methods: [
            { method_id: account, amount: 400 },
            { method_id: ach, amount: 600 },
          ],
        })
      assert.equal(split.status, 200, split.text)
      assert.deepEqual(
        split.body.payout_methods.map((row: { method: string; amount: number }) => [
          row.method,
          Number(row.amount),
        ]),
        [
          ['ACH', 600],
          ['DORADO_ACCOUNT', 400],
        ]
      )

      const cleared = await request(app)
        .put(`/api/orders/${order.id}/payout_methods`)
        .send({ methods: [] })
      assert.equal(cleared.status, 200, cleared.text)
      assert.ok(
        cleared.body.payout_methods.every((row: { amount: number | null }) => row.amount === null)
      )
    })
  })
})

test('a purchase completes when the customer is paid the total, and says when', async () => {
  await inOrders(async (c) => {
    const user = await aUser(c)
    const order = await anOrder(c, user, { direction: 'purchase' })
      .withLots(1)
      .withArrival()
      .withTotals({ total: 250 })
    await c.query('UPDATE orders.orders SET spots_locked = true WHERE id = $1', [order.id])

    const before = await orderRead.view(order.id)
    assert.notEqual(before?.state, 'Completed')
    assert.equal(before?.completed_at, null)

    await aLedgerEntry(c, user, { type: 'Credit', order_id: order.id, amount: 250 })

    const after = await orderRead.view(order.id)
    assert.equal(after?.state, 'Completed')
    assert.ok(after?.completed_at, 'a completed order carries no completed_at')
  })
})

test('an order holds notes in crm.notes, written and read by an admin', async () => {
  await inOrders(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' })

    await asAdmin(TEST_ACTOR, async () => {
      const written = await request(app)
        .post(`/api/orders/${order.id}/notes`)
        .send({ body: 'called the customer about the ring' })
      assert.equal(written.status, 201, written.text)
      assert.equal(written.body.order_id, order.id)
      assert.equal(written.body.created_by_id, TEST_ACTOR.id)

      const read = await request(app).get(`/api/orders/${order.id}/notes`)
      assert.equal(read.status, 200, read.text)
      assert.deepEqual(
        read.body.map((n: { body: string }) => n.body),
        ['called the customer about the ring']
      )
    })
  })
})

test('a purity dispute opens on a purchase lot once, resolves once, and reads back', async () => {
  await inOrders(async (c) => {
    const user = await aUser(c)
    const order = await anOrder(c, user, { direction: 'purchase' }).withLots(1)
    const sale = await anOrder(c, user, { direction: 'sale' }).withLots(1)
    const opening = { claimed_purity: 0.95, claim_source: 'customer XRF', reason: 'reads higher' }

    await asAdmin(TEST_ACTOR, async () => {
      const onSale = await request(app)
        .post(`/api/orders/lots/${sale.lots[0]!.id}/disputes`)
        .send(opening)
      assert.equal(onSale.status, 422, onSale.text)

      const opened = await request(app)
        .post(`/api/orders/lots/${order.lots[0]!.id}/disputes`)
        .send(opening)
      assert.equal(opened.status, 201, opened.text)
      assert.equal(Number(opened.body.our_purity), 0.925)
      assert.equal(opened.body.resolved_at, null)

      const twice = await request(app)
        .post(`/api/orders/lots/${order.lots[0]!.id}/disputes`)
        .send(opening)
      assert.equal(twice.status, 409, twice.text)

      const resolved = await request(app)
        .patch(`/api/orders/disputes/${opened.body.id}`)
        .send({ resolution: 'kept our assay' })
      assert.equal(resolved.status, 200, resolved.text)
      assert.equal(resolved.body.resolution, 'kept our assay')
      assert.equal(resolved.body.resolved_by_id, TEST_ACTOR.id)
      assert.ok(resolved.body.resolved_at)

      const again = await request(app)
        .patch(`/api/orders/disputes/${opened.body.id}`)
        .send({ resolution: 'again' })
      assert.equal(again.status, 409, again.text)

      const read = await request(app).get(`/api/orders/${order.id}/disputes`)
      assert.equal(read.status, 200, read.text)
      assert.equal(read.body.length, 1)
      assert.equal(read.body[0].claim_source, 'customer XRF')
    })
  })
})
