import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import type { Readable } from 'node:stream'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aRefiningOrder, aUser, anAddress, anOrder } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')
const delivery = await import('#documents/pdfs/delivery.ts')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inOrders = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] })

const BOUNDARY = 'DORADO-TEST-BOUNDARY'
const upload = (body: string): string =>
  `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="doc.pdf"\r\n` +
  `Content-Type: application/pdf\r\n\r\n${body}\r\n--${BOUNDARY}--\r\n`

const asBuffer = (res: Readable, cb: (err: Error | null, body: unknown) => void) => {
  const chunks: Buffer[] = []
  res.on('data', (chunk: Buffer) => chunks.push(chunk))
  res.on('end', () => cb(null, Buffer.concat(chunks)))
}

test('a document row carries the stored file size, time and creator, and none before', async () => {
  await inOrders(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1)

    await asAdmin(TEST_ACTOR, async () => {
      const before = await request(app).get(`/api/orders/${order.id}/documents`)
      const empty = before.body.find((r: { kind: string }) => r.kind === 'invoice')
      assert.equal(empty.size_bytes, null)
      assert.equal(empty.created_at, null)
      assert.equal(empty.created_by_id, null)

      const body = '%PDF-1.4 imported invoice'
      const imported = await request(app)
        .post(`/api/orders/${order.id}/documents/invoice`)
        .set('content-type', `multipart/form-data; boundary=${BOUNDARY}`)
        .send(upload(body))
      assert.equal(imported.status, 201, imported.text)
      assert.equal(imported.body.size_bytes, body.length)
      assert.equal(imported.body.created_by_id, TEST_ACTOR.id)
      assert.ok(!Number.isNaN(Date.parse(imported.body.created_at)), 'created_at is not a time')
    })
  })
})

test('GET /api/orders/:id/documents/:kind renders an available kind for its owner', async () => {
  await inOrders(async (c) => {
    const owner = await aUser(c)
    const order = await anOrder(c, owner, { direction: 'purchase' })
      .withLots(1)
      .withAddress(await anAddress(c, owner))
      .withFulfillment('CARRIER DROPOFF')

    await as({ ...owner, role: 'user' }, async () => {
      const res = await request(app)
        .get(`/api/orders/${order.id}/documents/shipping_instructions`)
        .buffer(true)
        .parse(asBuffer)
      assert.equal(res.status, 200, res.text)
      assert.equal(res.headers['content-type'], 'application/pdf')
      assert.match(res.headers['content-disposition'] ?? '', /shipping_instructions\.pdf/)
      assert.equal((res.body as Buffer).subarray(0, 4).toString(), '%PDF')
    })
  })
}, 120_000)

test('a renderable kind re-renders after an edit even when a stored row exists', async () => {
  await inOrders(async (c) => {
    const owner = await aUser(c)
    const order = await anOrder(c, owner, { direction: 'purchase' })
      .withLots(1)
      .withAddress(await anAddress(c, owner))
      .withFulfillment('CARRIER DROPOFF')
    await c.query(
      `INSERT INTO media.pdfs (kind, order_id, path, size_bytes)
       VALUES ('shipping_instructions', $1, 'pdfs/stale/shipping_instructions.pdf', 10)`,
      [order.id]
    )
    const stale = Buffer.from('%PDF-1.4 stale')
    const reads: string[] = []
    const reader = async (path: string) => {
      reads.push(path)
      return stale
    }

    const before = Buffer.from(
      await delivery.downloadOrderDocument(order.id, 'shipping_instructions', reader)
    )
    await c.query(`UPDATE orders.orders SET number = number + 900000000 WHERE id = $1`, [order.id])
    const after = Buffer.from(
      await delivery.downloadOrderDocument(order.id, 'shipping_instructions', reader)
    )

    assert.deepEqual(reads, [], 'a renderable kind read the stored file')
    assert.equal(before.subarray(0, 4).toString(), '%PDF')
    assert.notDeepEqual(before, stale)
    assert.notDeepEqual(after, before, 'the edit did not reach the download')
  })
}, 120_000)

test('the order download refuses what the order does not offer, and a stranger', async () => {
  await inOrders(async (c) => {
    const owner = await aUser(c)
    const stranger = await aUser(c)
    const order = await anOrder(c, owner, { direction: 'purchase' }).withLots(1)

    await asAdmin(TEST_ACTOR, async () => {
      const unfinalized = await request(app).get(`/api/orders/${order.id}/documents/invoice`)
      assert.equal(unfinalized.status, 422, unfinalized.text)
      const foreign = await request(app).get(`/api/orders/${order.id}/documents/settlement`)
      assert.equal(foreign.status, 404, foreign.text)
      const unknown = await request(app).get(`/api/orders/${order.id}/documents/not_a_kind`)
      assert.equal(unknown.status, 400, unknown.text)
    })

    await as({ ...stranger, role: 'user' }, async () => {
      const res = await request(app).get(`/api/orders/${order.id}/documents/packing_list`)
      assert.ok([403, 404].includes(res.status), `a stranger got ${res.status}`)
    })
  })
})

test('an imported refiner settlement streams its stored bytes', async () => {
  await inOrders(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1)
    const refiner = await aRefiningOrder(c, order)
    const body = '%PDF-1.4 refiner settlement'

    await asAdmin(TEST_ACTOR, async () => {
      const missing = await request(app).get(
        `/api/refining/orders/${refiner.id}/documents/settlement`
      )
      assert.equal(missing.status, 422, missing.text)

      const imported = await request(app)
        .post(`/api/refining/orders/${refiner.id}/documents/settlement`)
        .set('content-type', `multipart/form-data; boundary=${BOUNDARY}`)
        .send(upload(body))
      assert.equal(imported.status, 201, imported.text)
      assert.equal(imported.body.size_bytes, body.length)
    })

    const bytes = await delivery.downloadRefiningDocument(refiner.id, 'settlement', async () =>
      Buffer.from(body)
    )
    assert.equal(Buffer.from(bytes).toString(), body)
  })
})

test('the refiner download is admin-only and refuses a kind it does not carry', async () => {
  await inOrders(async (c) => {
    const owner = await aUser(c)
    const order = await anOrder(c, owner, { direction: 'purchase' }).withLots(1)
    const refiner = await aRefiningOrder(c, order)

    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).get(
        `/api/refining/orders/${refiner.id}/documents/pickup_manifest`
      )
      assert.equal(res.status, 404, res.text)
    })

    await as({ ...owner, role: 'user' }, async () => {
      const res = await request(app).get(`/api/refining/orders/${refiner.id}/documents/invoice`)
      assert.equal(res.status, 403, res.text)
    })
  })
})
