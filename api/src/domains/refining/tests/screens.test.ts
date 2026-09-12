import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anOrder, anUnknownId } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const BOUNDARY = 'DORADO-TEST-BOUNDARY'
const upload = (filename: string, body: string): string =>
  `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
  `Content-Type: application/pdf\r\n\r\n${body}\r\n--${BOUNDARY}--\r\n`

const inRefining = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS })

const refinerId = async (c: PoolClient): Promise<string> => {
  const { rows } = await c.query<{ id: string }>('SELECT id FROM refiners.refiners LIMIT 1')
  assert.ok(rows[0], 'the test database has no refiner')
  return rows[0].id
}

const aFinalizedOrder = async (c: PoolClient) => {
  const seller = await aUser(c)
  const order = await anOrder(c, seller, { direction: 'purchase' })
    .withLots(2, { confirmed: true })
    .withSpots()
    .withTotals({ total: 900 })
  await c.query(`UPDATE orders.orders SET spots_locked = true WHERE id = $1`, [order.id])
  return order
}

test('a batch creates the order and assigns its lots in one call', async () => {
  await inRefining(async (c) => {
    const order = await aFinalizedOrder(c)
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app)
        .post('/api/refining/orders')
        .send({
          refiner_id: await refinerId(c),
          direction: 'sell',
          lot_ids: order.lots.map((lot) => lot.lot_id),
        })
      assert.equal(res.status, 201, res.text)
      assert.equal(res.body.lots.length, 2, 'the order was created without its lots')

      const stranger = await request(app)
        .post('/api/refining/orders')
        .send({ refiner_id: await refinerId(c), direction: 'buy', lot_ids: [anUnknownId()] })
      assert.equal(stranger.status, 404, stranger.text)
      const { rows } = await c.query(
        `SELECT count(*)::int n FROM refining.orders WHERE direction = 'buy' AND sent_at IS NULL`
      )
      assert.equal(rows[0].n, 0, 'a refused batch left an empty refiner order behind')
    })
  })
})

test('Create Sale wraps a finalized purchase order, and pools onto the open sell order', async () => {
  await inRefining(async (c) => {
    const first = await aFinalizedOrder(c)
    const second = await aFinalizedOrder(c)
    const refiner_id = await refinerId(c)

    await asAdmin(TEST_ACTOR, async () => {
      const made = await request(app)
        .post(`/api/orders/${first.id}/refining-sale`)
        .send({ refiner_id })
      assert.equal(made.status, 201, made.text)
      assert.equal(made.body.direction, 'sell')
      assert.equal(made.body.lots.length, 2)

      const pooled = await request(app)
        .post(`/api/orders/${second.id}/refining-sale`)
        .send({ refiner_id })
      assert.equal(pooled.status, 201, pooled.text)
      assert.equal(pooled.body.id, made.body.id, 'a second sale opened a second order')
      assert.equal(pooled.body.lots.length, 4)
      assert.ok(
        pooled.body.lots.every((lot: { order_reference: string }) =>
          lot.order_reference.startsWith('PO-')
        ),
        'a refiner lot does not say which customer order it came off'
      )
    })
  })
})

test('an unfinalized order offers Create Sale with a reason; a sales order is refused', async () => {
  await inRefining(async (c) => {
    const seller = await aUser(c)
    const open = await anOrder(c, seller, { direction: 'purchase' }).withLots(1)
    const sale = await anOrder(c, seller, { direction: 'sale' }).withLots(1)
    const refiner_id = await refinerId(c)

    await asAdmin(TEST_ACTOR, async () => {
      const offered = await request(app).get(`/api/orders/${open.id}`)
      assert.match(
        offered.body.actions.find((a: { name: string }) => a.name === 'refining_sale')?.confirm ??
          '',
        /not finalized/,
        'an unfinalized order offered Create Sale with no reason'
      )

      const unfinalized = await request(app)
        .post(`/api/orders/${open.id}/refining-sale`)
        .send({ refiner_id })
      assert.equal(unfinalized.status, 201, unfinalized.text)

      const wrongWay = await request(app)
        .post(`/api/orders/${sale.id}/refining-sale`)
        .send({ refiner_id })
      assert.equal(wrongWay.status, 422, wrongWay.text)
    })
  })
})

test('cancelling releases the lots and frees the refiner for a new sell order', async () => {
  await inRefining(async (c) => {
    const order = await aFinalizedOrder(c)
    const refiner_id = await refinerId(c)

    await asAdmin(TEST_ACTOR, async () => {
      const made = await request(app)
        .post(`/api/orders/${order.id}/refining-sale`)
        .send({ refiner_id })
      assert.equal(made.status, 201, made.text)

      const cancelled = await request(app).post(`/api/refining/orders/${made.body.id}/cancel`)
      assert.equal(cancelled.status, 200, cancelled.text)
      assert.equal(cancelled.body.state, 'Cancelled')
      assert.deepEqual(cancelled.body.lots, [], 'a cancelled order kept its lots')

      const again = await request(app)
        .post(`/api/orders/${order.id}/refining-sale`)
        .send({ refiner_id })
      assert.equal(again.status, 201, again.text)
      assert.notEqual(again.body.id, made.body.id)

      const twice = await request(app).post(`/api/refining/orders/${made.body.id}/cancel`)
      assert.equal(twice.status, 409, twice.text)
    })
  })
})

test('the spots read answers a row per metal, and says whether the price is a lock', async () => {
  await inRefining(async (c) => {
    const order = await aFinalizedOrder(c)
    await asAdmin(TEST_ACTOR, async () => {
      const made = await request(app)
        .post('/api/refining/orders')
        .send({
          refiner_id: await refinerId(c),
          direction: 'sell',
          lot_ids: order.lots.map((lot) => lot.lot_id),
        })
      const res = await request(app).get(`/api/refining/orders/${made.body.id}/spots`)
      assert.equal(res.status, 200, res.text)
      assert.equal(res.body.length, 1, 'one metal on the order, one frozen price')
      assert.equal(res.body[0].metal_id, 'Gold')
      assert.equal(res.body[0].locked, false, 'an unlocked pool reported a lock')
      assert.ok(res.body[0].bid !== undefined)
    })
  })
})

test('the Charges, Totals and Settlement figures come back as money', async () => {
  await inRefining(async (c) => {
    const order = await aFinalizedOrder(c)
    await asAdmin(TEST_ACTOR, async () => {
      const made = await request(app)
        .post('/api/refining/orders')
        .send({
          refiner_id: await refinerId(c),
          direction: 'sell',
          lot_ids: order.lots.map((lot) => lot.lot_id),
        })
      const patched = await request(app)
        .patch(`/api/refining/orders/${made.body.id}`)
        .send({ fee: 40 })
      assert.equal(patched.status, 200, patched.text)

      assert.equal(patched.body.totals.fee, 40)
      assert.equal(patched.body.totals.pool_remediation, null)
      assert.equal(patched.body.totals.payment_charge, null)
      assert.equal(typeof patched.body.totals.total, 'number')
      assert.equal(patched.body.totals.total, -40, 'an unpriced order still owes its fee')
      assert.ok('expected_settlement' in patched.body)
      assert.ok(patched.body.orders_to_date > 0)
    })
  })
})

test('a refiner order carries an office, and the location list is where it comes from', async () => {
  await inRefining(async (c) => {
    await asAdmin(TEST_ACTOR, async () => {
      const made = await request(app)
        .post('/api/refining/orders')
        .send({ refiner_id: await refinerId(c), direction: 'buy' })
      const offices = await request(app).get('/api/locations')
      const location_id = offices.body[0].id

      const patched = await request(app)
        .patch(`/api/refining/orders/${made.body.id}`)
        .send({ location_id })
      assert.equal(patched.status, 200, patched.text)
      assert.equal(patched.body.location_id, location_id)
    })
  })
})

test('a refiner order has a Payment card of its own, and a payout can be opened on it', async () => {
  await inRefining(async (c) => {
    const order = await aFinalizedOrder(c)
    await asAdmin(TEST_ACTOR, async () => {
      const made = await request(app)
        .post('/api/refining/orders')
        .send({
          refiner_id: await refinerId(c),
          direction: 'buy',
          lot_ids: order.lots.map((lot) => lot.lot_id),
        })
      await request(app).patch(`/api/refining/orders/${made.body.id}`).send({ fee: 25 })

      const empty = await request(app).get(`/api/refining/orders/${made.body.id}/payment`)
      assert.equal(empty.status, 200, empty.text)
      assert.equal(empty.body.refining_order_id, made.body.id)
      assert.equal(empty.body.order_id, null)
      assert.equal(empty.body.direction, 'buy')
      assert.equal(empty.body.state, null)

      const opened = await request(app)
        .post('/api/payments/payouts')
        .send({ refining_order_id: made.body.id, rail: 'WIRE' })
      assert.equal(opened.status, 201, opened.text)
      assert.equal(opened.body.refining_order_id, made.body.id)
      assert.equal(opened.body.order_id, null)
      assert.equal(opened.body.reference, `RO-${made.body.number}`)

      const view = await request(app).get(`/api/refining/orders/${made.body.id}/payment`)
      assert.equal(view.body.state, 'Not sent')
      assert.equal(view.body.kind, 'payout')

      const bothKeys = await request(app)
        .post('/api/payments/payouts')
        .send({ order_id: order.id, refining_order_id: made.body.id, rail: 'WIRE' })
      assert.equal(bothKeys.status, 422, bothKeys.text)
    })
  })
})

test('a refiner order names its one document, and an imported file is what makes it available', async () => {
  await inRefining(async (c) => {
    await asAdmin(TEST_ACTOR, async () => {
      const made = await request(app)
        .post('/api/refining/orders')
        .send({ refiner_id: await refinerId(c), direction: 'buy' })

      const listed = await request(app).get(`/api/refining/orders/${made.body.id}/documents`)
      assert.equal(listed.status, 200, listed.text)
      assert.deepEqual(
        listed.body.map((row: { name: string }) => row.name),
        ['Invoice']
      )
      assert.equal(listed.body.find((r: { kind: string }) => r.kind === 'invoice').available, false)

      const imported = await request(app)
        .post(`/api/refining/orders/${made.body.id}/documents/invoice`)
        .set('content-type', `multipart/form-data; boundary=${BOUNDARY}`)
        .send(upload('statement.pdf', '%PDF-1.4 statement'))
      assert.equal(imported.status, 201, imported.text)
      assert.equal(imported.body.available, true)

      const after = await request(app).get(`/api/refining/orders/${made.body.id}/documents`)
      assert.equal(
        after.body.find((r: { kind: string }) => r.kind === 'invoice').pdf_id,
        imported.body.pdf_id
      )
    })
  })
})

test('every new refiner route is admin-only', async () => {
  await inRefining(async (c) => {
    const customer = await aUser(c)
    await as({ ...customer, role: 'user' }, async () => {
      const id = anUnknownId()
      for (const [verb, url] of [
        ['post', `/api/refining/orders/${id}/cancel`],
        ['get', `/api/refining/orders/${id}/spots`],
        ['get', `/api/refining/orders/${id}/payment`],
        ['get', `/api/refining/orders/${id}/documents`],
      ] as const) {
        assert.equal((await request(app)[verb](url)).status, 403, `${verb} ${url}`)
      }
    })
  })
})
