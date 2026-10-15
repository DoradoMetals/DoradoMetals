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
import * as lots from '#db/inventory/lots/repo.ts'
import * as images from '#db/media/images/repo.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inLots = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] })

const anImage = async (c: PoolClient, user_id: string, name: string) =>
  await images.create(
    {
      user_id,
      bucket: 'test-bucket',
      path: `${user_id}/`,
      filename: name,
      mime_type: 'image/jpeg',
    },
    c
  )

test('an admin adds, reads and unlinks a lot photo set, each with a presigned url', async () => {
  await inLots(async (c) => {
    const customer = await aUser(c)
    const lot = await lots.create({ metal_id: 'Gold', pre_melt: 5, purity: 0.9 }, c)
    const first = await anImage(c, customer.id, 'first.jpg')
    const second = await anImage(c, customer.id, 'second.jpg')

    await asAdmin(TEST_ACTOR, async () => {
      const empty = await request(app).get(`/api/lots/${lot.id}/images`)
      assert.equal(empty.status, 200, empty.text)
      assert.deepEqual(empty.body, [])

      const added = await request(app)
        .post(`/api/lots/${lot.id}/images`)
        .send({ image_id: first.id })
      assert.equal(added.status, 201, added.text)
      await request(app).post(`/api/lots/${lot.id}/images`).send({ image_id: second.id })

      const read = await request(app).get(`/api/lots/${lot.id}/images`)
      assert.deepEqual(
        read.body.map((r: { image_id: string; sort_order: number }) => [r.image_id, r.sort_order]),
        [
          [first.id, 0],
          [second.id, 1],
        ]
      )
      assert.match(read.body[0].url, /first\.jpg/)

      const removed = await request(app).delete(`/api/lots/${lot.id}/images/${first.id}`)
      assert.equal(removed.status, 200, removed.text)
      assert.deepEqual(
        removed.body.map((r: { image_id: string }) => r.image_id),
        [second.id]
      )

      const again = await request(app).delete(`/api/lots/${lot.id}/images/${first.id}`)
      assert.equal(again.status, 404, again.text)
    })
  })
})

test('the photo routes refuse an unknown lot, an unknown image, a loose body and a customer', async () => {
  await inLots(async (c) => {
    const customer = await aUser(c)
    const lot = await lots.create({ metal_id: 'Gold', pre_melt: 5, purity: 0.9 }, c)

    await asAdmin(TEST_ACTOR, async () => {
      const noLot = await request(app).get(`/api/lots/${anUnknownId()}/images`)
      assert.equal(noLot.status, 404, noLot.text)
      const noImage = await request(app)
        .post(`/api/lots/${lot.id}/images`)
        .send({ image_id: anUnknownId() })
      assert.equal(noImage.status, 422, noImage.text)
      const loose = await request(app)
        .post(`/api/lots/${lot.id}/images`)
        .send({ image_id: anUnknownId(), sort_order: 3 })
      assert.equal(loose.status, 400, loose.text)
    })

    await as({ ...customer, role: 'user' }, async () => {
      const res = await request(app).get(`/api/lots/${lot.id}/images`)
      assert.equal(res.status, 403, res.text)
    })
  })
})

test('an admin can open a photo somebody else uploaded; a stranger still cannot', async () => {
  await inLots(async (c) => {
    const customer = await aUser(c)
    const stranger = await aUser(c)
    const image = await anImage(c, customer.id, 'theirs.jpg')

    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).get(`/api/images/${image.id}/url`)
      assert.equal(res.status, 200, res.text)
      assert.match(res.body, /theirs\.jpg/)
    })

    await as({ ...stranger, role: 'user' }, async () => {
      const res = await request(app).get(`/api/images/${image.id}/url`)
      assert.equal(res.status, 404, res.text)
    })
  })
})

test('a lot patch that sets the cover puts it first in the set, at sort_order 0', async () => {
  await inLots(async (c) => {
    const customer = await aUser(c)
    const order = await anOrder(c, customer, { direction: 'purchase' }).withLots(1)
    const link = order.lots[0]!
    const first = await anImage(c, customer.id, 'first.jpg')
    const second = await anImage(c, customer.id, 'second.jpg')
    const third = await anImage(c, customer.id, 'third.jpg')

    await asAdmin(TEST_ACTOR, async () => {
      await request(app).post(`/api/lots/${link.lot_id}/images`).send({ image_id: first.id })
      await request(app).post(`/api/lots/${link.lot_id}/images`).send({ image_id: second.id })

      const patched = await request(app)
        .patch(`/api/orders/lots/${link.id}`)
        .send({ image_id: third.id })
      assert.equal(patched.status, 200, patched.text)

      const set = await request(app).get(`/api/lots/${link.lot_id}/images`)
      assert.deepEqual(
        set.body.map((r: { image_id: string; sort_order: number }) => [r.image_id, r.sort_order]),
        [
          [third.id, 0],
          [first.id, 1],
          [second.id, 2],
        ]
      )

      await request(app).patch(`/api/orders/lots/${link.id}`).send({ image_id: second.id })
      const again = await request(app).get(`/api/lots/${link.lot_id}/images`)
      assert.deepEqual(
        again.body.map((r: { image_id: string; sort_order: number }) => [r.image_id, r.sort_order]),
        [
          [second.id, 0],
          [third.id, 1],
          [first.id, 2],
        ]
      )
    })

    const { rows } = await c.query<{ image_id: string }>(
      'SELECT image_id FROM inventory.lots WHERE id = $1',
      [link.lot_id]
    )
    assert.equal(rows[0]!.image_id, second.id, 'the cover column holds the patched image')
  })
})

test('a cover patch with an unknown image writes neither the cover nor the set', async () => {
  await inLots(async (c) => {
    const customer = await aUser(c)
    const order = await anOrder(c, customer, { direction: 'purchase' }).withLots(1)
    const link = order.lots[0]!

    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app)
        .patch(`/api/orders/lots/${link.id}`)
        .send({ image_id: anUnknownId() })
      assert.equal(res.status, 422, res.text)
      const set = await request(app).get(`/api/lots/${link.lot_id}/images`)
      assert.deepEqual(set.body, [])
    })
  })
})
