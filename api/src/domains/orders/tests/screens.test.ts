import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anAddress, anOrder } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')
const orders = await import('#orders/service.ts')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const BOUNDARY = 'DORADO-TEST-BOUNDARY'
const upload = (filename: string, body: string): string =>
  `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
  `Content-Type: application/pdf\r\n\r\n${body}\r\n--${BOUNDARY}--\r\n`

const inOrders = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] })

test('the header reads PO-/SO- off the server, and counts the customer orders', async () => {
  await inOrders(async (c) => {
    const seller = await aUser(c)
    const first = await anOrder(c, seller, { direction: 'purchase' }).withLots(1)
    const second = await anOrder(c, seller, { direction: 'sale' }).withLots(1)

    await asAdmin(TEST_ACTOR, async () => {
      const purchase = await request(app).get(`/api/orders/${first.id}`)
      assert.equal(purchase.status, 200, purchase.text)
      assert.equal(purchase.body.reference, `PO-${first.number}`)
      assert.equal(purchase.body.user.orders_to_date, 2)

      const sale = await request(app).get(`/api/orders/${second.id}`)
      assert.equal(sale.body.reference, `SO-${second.number}`)
    })
  })
})

test('the list carries the same reference and customer as the single view', async () => {
  await inOrders(async (c) => {
    const buyer = await aUser(c)
    const order = await anOrder(c, buyer, { direction: 'purchase' }).withLots(1)

    await asAdmin(TEST_ACTOR, async () => {
      const list = await request(app).get('/api/orders').query({ direction: 'purchase' })
      assert.equal(list.status, 200, list.text)
      const row = list.body.find((o: { id: string }) => o.id === order.id)
      assert.ok(row, 'the built order is missing from the admin list')

      const single = await request(app).get(`/api/orders/${order.id}`)
      assert.equal(single.status, 200, single.text)

      assert.equal(row.reference, single.body.reference)
      assert.equal(row.reference, `PO-${order.number}`)
      assert.deepEqual(row.customer, { id: buyer.id, name: buyer.name, email: buyer.email })
    })

    await as(buyer, async () => {
      const own = await request(app).get('/api/orders').query({ direction: 'purchase' })
      assert.equal(own.status, 200, own.text)
      const row = own.body.find((o: { id: string }) => o.id === order.id)
      assert.ok(row, "the customer's own list is missing their order")
      assert.equal(row.reference, `PO-${order.number}`)
      assert.equal(row.customer.id, buyer.id)
    })
  })
})

test('lock_spots and unlock_spots are answered, and finalizing closes the unlock', async () => {
  await inOrders(async (c) => {
    const seller = await aUser(c)
    const order = await anOrder(c, seller, { direction: 'purchase' })
      .withLots(1, { confirmed: true })
      .withSpots()
      .withTotals({})

    await asAdmin(TEST_ACTOR, async () => {
      const open = await request(app).get(`/api/orders/${order.id}`)
      assert.equal(open.body.actions.lock_spots, true)
      assert.equal(open.body.actions.unlock_spots, false)

      const locked = await request(app).put(`/api/orders/${order.id}/spots`).send({ lock: true })
      assert.equal(locked.status, 200, locked.text)
      const held = await request(app).get(`/api/orders/${order.id}`)
      assert.equal(held.body.actions.lock_spots, false)
      assert.equal(held.body.actions.unlock_spots, true, 'a locked, unpriced order cannot unlock')

      const finalized = await request(app).post(`/api/orders/${order.id}/finalize`)
      assert.equal(finalized.status, 200, finalized.text)
      const done = await request(app).get(`/api/orders/${order.id}`)
      assert.equal(done.body.actions.unlock_spots, false, 'a finalized order offered Unlock')
    })
  })
})

test('Cancel with no body picks the default return service and box', async () => {
  await inOrders(async (c) => {
    const seller = await aUser(c)
    const address = await anAddress(c, seller)
    const order = await anOrder(c, seller, { direction: 'purchase' })
      .withLots(1)
      .withAddress(address)
      .withFulfillment('CARRIER DROPOFF')
      .withTotals({ total: 500 })

    let bought: string | null = null
    const view = await orders.cancel(order.id, {}, async (id) => {
      bought = id
    })
    assert.ok(view, 'the cancel answered no view')
    assert.ok(bought, 'no return label was bought for a bare Cancel')

    const { rows } = await c.query(
      `SELECT s.carrier_service_id, s.package_id, s.bill_return_to_customer
         FROM shipping.shipments s
         JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
         JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
        WHERE f.order_id = $1 AND s.direction = 'Return'`,
      [order.id]
    )
    assert.equal(rows.length, 1)
    assert.ok(rows[0].carrier_service_id, 'the return leg was left with no service')
    assert.ok(rows[0].package_id, 'the return leg was left with no box')
    assert.equal(rows[0].bill_return_to_customer, false)
  })
})

test('the return leg records who pays for it when the card says so', async () => {
  await inOrders(async (c) => {
    const seller = await aUser(c)
    const address = await anAddress(c, seller)
    const order = await anOrder(c, seller, { direction: 'purchase' })
      .withLots(1)
      .withAddress(address)
      .withFulfillment('CARRIER DROPOFF')
      .withTotals({ total: 500 })

    await orders.cancel(order.id, { bill_return_to_customer: true }, async () => {})

    const { rows } = await c.query(
      `SELECT s.bill_return_to_customer
         FROM shipping.shipments s
         JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
         JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
        WHERE f.order_id = $1 AND s.direction = 'Return'`,
      [order.id]
    )
    assert.equal(rows[0].bill_return_to_customer, true)
  })
})

test('the lot search finds a lot by its order number and hides the batched ones', async () => {
  await inOrders(async (c) => {
    const seller = await aUser(c)
    const order = await anOrder(c, seller, { direction: 'purchase' }).withLots(2)

    await asAdmin(TEST_ACTOR, async () => {
      const found = await request(app)
        .get('/api/lots')
        .query({ q: String(order.number), unassigned: 'true' })
      assert.equal(found.status, 200, found.text)
      const ids = found.body.map((row: { id: string }) => row.id)
      for (const lot of order.lots)
        assert.ok(ids.includes(lot.lot_id), 'a free lot was not offered')
      assert.ok(found.body[0].reference.startsWith('Lot '), 'the row carries no lot reference')

      const refiner = await request(app)
        .post('/api/refining/orders')
        .send({
          refiner_id: (await c.query(`SELECT id FROM refiners.refiners LIMIT 1`)).rows[0].id,
          direction: 'sell',
          lot_ids: order.lots.map((lot) => lot.lot_id),
        })
      assert.equal(refiner.status, 201, refiner.text)

      const after = await request(app)
        .get('/api/lots')
        .query({ q: String(order.number), unassigned: 'true' })
      assert.deepEqual(after.body, [], 'a batched lot was still offered as unassigned')
    })
  })
})

test('a document that waits for finalization is unavailable until a file exists, then it sends', async () => {
  await inOrders(async (c) => {
    const seller = await aUser(c)
    const order = await anOrder(c, seller, { direction: 'purchase' })
      .withLots(1)
      .withFulfillment('CARRIER DROPOFF')

    await asAdmin(TEST_ACTOR, async () => {
      const before = await request(app).get(`/api/orders/${order.id}/documents`)
      assert.equal(before.status, 200, before.text)
      const invoice = before.body.find((row: { kind: string }) => row.kind === 'invoice')
      assert.equal(invoice.available, false, 'an invoice was offered before finalization')
      assert.equal(invoice.pdf_id, null)
      const instructions = before.body.find(
        (row: { kind: string }) => row.kind === 'shipping_instructions'
      )
      assert.equal(instructions.available, true, 'a document with a renderer was withheld')

      const refused = await request(app).post(`/api/orders/${order.id}/documents/invoice/send`)
      assert.equal(refused.status, 422, refused.text)

      const imported = await request(app)
        .post(`/api/orders/${order.id}/documents/invoice`)
        .set('content-type', `multipart/form-data; boundary=${BOUNDARY}`)
        .send(upload('instructions.pdf', '%PDF-1.4 imported'))
      assert.equal(imported.status, 201, imported.text)
      assert.equal(imported.body.available, true)
      assert.ok(imported.body.pdf_id, 'the import recorded no file')

      const after = await request(app).get(`/api/orders/${order.id}/documents`)
      const row = after.body.find((r: { kind: string }) => r.kind === 'invoice')
      assert.equal(row.available, true)
      assert.equal(row.pdf_id, imported.body.pdf_id)
    })
  })
})

test('each renderable kind sends the document its own renderer built', async () => {
  await inOrders(async (c) => {
    const seller = await aUser(c)
    const address = await anAddress(c, seller)
    const order = await anOrder(c, seller, { direction: 'purchase' })
      .withLots(1)
      .withAddress(address)
      .withFulfillment('CARRIER DROPOFF')

    await asAdmin(TEST_ACTOR, async () => {
      for (const kind of ['packing_list', 'return_packing_list', 'shipping_instructions']) {
        const sent = await request(app).post(`/api/orders/${order.id}/documents/${kind}/send`)
        assert.equal(sent.status, 200, `${kind}: ${sent.text}`)
        assert.equal(sent.body.kind, kind)
      }
    })
  })
}, 120_000)

test('an import with no file, and an unknown kind, are both refused', async () => {
  await inOrders(async (c) => {
    const seller = await aUser(c)
    const order = await anOrder(c, seller, { direction: 'purchase' }).withLots(1)

    await asAdmin(TEST_ACTOR, async () => {
      const empty = await request(app)
        .post(`/api/orders/${order.id}/documents/assay_results`)
        .set('content-type', 'multipart/form-data; boundary=Z')
        .send('--Z--\r\n')
      assert.equal(empty.status, 422, empty.text)

      const unknown = await request(app).post(`/api/orders/${order.id}/documents/not_a_kind/send`)
      assert.equal(unknown.status, 400, unknown.text)
    })
  })
})

test('the document routes are admin-only', async () => {
  await inOrders(async (c) => {
    const seller = await aUser(c)
    const order = await anOrder(c, seller, { direction: 'purchase' }).withLots(1)
    await as({ ...seller, role: 'user' }, async () => {
      const res = await request(app).post(`/api/orders/${order.id}/documents/invoice/send`)
      assert.equal(res.status, 403, res.text)
      assert.equal((await request(app).get('/api/lots')).status, 403)
    })
  })
})
