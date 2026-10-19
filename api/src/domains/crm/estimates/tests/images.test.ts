// RULING 137: photos on a lead's estimate items.
//
// leads.estimate_item_images (estimate_item_id, image_id, sort_order, audit)
// is a pure link between a leads.estimate_items row and a media.images row,
// the twin of inventory.lot_images (migration 284). The upload itself goes
// through the existing media path; these routes only link, list and unlink.
//
//   GET    /api/leads/:id/estimate/items/:itemId/images            EstimateItemImageView[]
//   POST   /api/leads/:id/estimate/items/:itemId/images            body EstimateItemImageAdd -> 201, EstimateItemImageView[]
//   DELETE /api/leads/:id/estimate/items/:itemId/images/:imageId   200, EstimateItemImageView[]
//
// The item list (GET /api/leads/:id/estimate/items) answers EstimateItemView:
// the row plus `image_count`.
import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import {
  EstimateItemImage,
  EstimateItemImageAdd,
  EstimateItemImageView,
  EstimateItemView,
} from '@dorado/contracts'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aLead, anEstimateItem, anUnknownId } from '#shared/testing/builders/index.ts'
import * as images from '#db/media/images/repo.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inLeads = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id })

const anImage = async (c: PoolClient, name: string) =>
  await images.create(
    {
      user_id: TEST_ACTOR.id,
      bucket: 'test-bucket',
      path: `${TEST_ACTOR.id}/`,
      filename: name,
      mime_type: 'image/jpeg',
    },
    c
  )

const url = (lead_id: string, item_id: string) =>
  `/api/leads/${lead_id}/estimate/items/${item_id}/images`

const add = (image_id: string): EstimateItemImageAdd => ({ image_id })

test('an admin links two images, reads them in order with a url, and unlinks one', async () => {
  await inLeads(async (c) => {
    const lead = await aLead(c)
    const item = await anEstimateItem(c, lead.id)
    const first = await anImage(c, 'ring-front.jpg')
    const second = await anImage(c, 'ring-back.jpg')

    await asAdmin(TEST_ACTOR, async () => {
      const empty = await request(app).get(url(lead.id, item.id))
      assert.equal(empty.status, 200, empty.text)
      assert.deepEqual(empty.body, [])

      const added = await request(app).post(url(lead.id, item.id)).send(add(first.id))
      assert.equal(added.status, 201, added.text)
      await request(app).post(url(lead.id, item.id)).send(add(second.id))

      const read = await request(app).get(url(lead.id, item.id))
      assert.equal(read.status, 200, read.text)
      const rows = read.body.map((r: unknown) => EstimateItemImageView.parse(r))
      assert.deepEqual(
        rows.map((r: EstimateItemImageView) => [r.image_id, r.sort_order]),
        [
          [first.id, 0],
          [second.id, 1],
        ]
      )
      assert.match(rows[0].url, /ring-front\.jpg/)

      const removed = await request(app).delete(`${url(lead.id, item.id)}/${first.id}`)
      assert.equal(removed.status, 200, removed.text)
      assert.deepEqual(
        removed.body.map((r: { image_id: string }) => r.image_id),
        [second.id]
      )

      const again = await request(app).delete(`${url(lead.id, item.id)}/${first.id}`)
      assert.equal(again.status, 404, again.text)
    })

    assert.ok(await images.getOne(first.id, c), 'unlinking deleted the media.images row')
  })
})

test('the link row is written to leads.estimate_item_images and stamped by the database', async () => {
  await inLeads(async (c) => {
    const lead = await aLead(c)
    const item = await anEstimateItem(c, lead.id)
    const image = await anImage(c, 'chain.jpg')

    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).post(url(lead.id, item.id)).send(add(image.id))
      assert.equal(res.status, 201, res.text)
    })

    const { rows } = await c.query(
      `SELECT * FROM leads.estimate_item_images WHERE estimate_item_id = $1`,
      [item.id]
    )
    assert.equal(rows.length, 1)
    const link = EstimateItemImage.pick({
      estimate_item_id: true,
      image_id: true,
      sort_order: true,
    }).parse(rows[0])
    assert.equal(link.estimate_item_id, item.id)
    assert.equal(link.image_id, image.id)
    assert.equal(link.sort_order, 0)
    assert.ok(rows[0].created_at, 'the audit trigger did not stamp created_at')
    assert.ok(rows[0].updated_at, 'the audit trigger did not stamp updated_at')
    assert.equal(rows[0].created_by_id, TEST_ACTOR.id, 'the audit trigger did not stamp the actor')
  })
})

test('linking the same image twice is a no-op, not a second row', async () => {
  await inLeads(async (c) => {
    const lead = await aLead(c)
    const item = await anEstimateItem(c, lead.id)
    const image = await anImage(c, 'coin.jpg')

    await asAdmin(TEST_ACTOR, async () => {
      await request(app).post(url(lead.id, item.id)).send(add(image.id))
      const twice = await request(app).post(url(lead.id, item.id)).send(add(image.id))
      assert.equal(twice.status, 201, twice.text)
      assert.equal(twice.body.length, 1, 'a second link of one image made a second row')
    })
  })
})

test('the item list carries image_count for each item', async () => {
  await inLeads(async (c) => {
    const lead = await aLead(c)
    const withPhotos = await anEstimateItem(c, lead.id)
    const without = await anEstimateItem(c, lead.id, { weight: 3 })
    const a = await anImage(c, 'a.jpg')
    const b = await anImage(c, 'b.jpg')

    await asAdmin(TEST_ACTOR, async () => {
      await request(app).post(url(lead.id, withPhotos.id)).send(add(a.id))
      await request(app).post(url(lead.id, withPhotos.id)).send(add(b.id))

      const listed = await request(app).get(`/api/leads/${lead.id}/estimate/items`)
      assert.equal(listed.status, 200, listed.text)
      const items = listed.body.map((r: unknown) => EstimateItemView.parse(r))
      const count = (id: string) => items.find((r: EstimateItemView) => r.id === id)?.image_count
      assert.equal(count(withPhotos.id), 2)
      assert.equal(count(without.id), 0, 'an item with no photos must read 0, not null')

      await request(app).delete(`${url(lead.id, withPhotos.id)}/${a.id}`)
      const after = await request(app).get(`/api/leads/${lead.id}/estimate/items`)
      const moved = after.body.find((r: { id: string }) => r.id === withPhotos.id)
      assert.equal(moved.image_count, 1, 'unlinking did not lower image_count')
    })
  })
})

test('an item reached through the wrong lead id is 404 on every image route', async () => {
  await inLeads(async (c) => {
    const mine = await aLead(c)
    const theirs = await aLead(c)
    const item = await anEstimateItem(c, theirs.id)
    const image = await anImage(c, 'theirs.jpg')

    await asAdmin(TEST_ACTOR, async () => {
      await request(app).post(url(theirs.id, item.id)).send(add(image.id))

      assert.equal((await request(app).get(url(mine.id, item.id))).status, 404)
      assert.equal((await request(app).post(url(mine.id, item.id)).send(add(image.id))).status, 404)
      assert.equal((await request(app).delete(`${url(mine.id, item.id)}/${image.id}`)).status, 404)
    })

    const { rows } = await c.query(
      `SELECT count(*)::int AS n FROM leads.estimate_item_images WHERE estimate_item_id = $1`,
      [item.id]
    )
    assert.equal(rows[0].n, 1, 'a request through the wrong lead changed the other lead')
  })
})

test('an unknown lead, item or image, a loose body and a non-uuid are refused', async () => {
  await inLeads(async (c) => {
    const lead = await aLead(c)
    const item = await anEstimateItem(c, lead.id)

    await asAdmin(TEST_ACTOR, async () => {
      assert.equal((await request(app).get(url(anUnknownId(), item.id))).status, 404)
      assert.equal((await request(app).get(url(lead.id, anUnknownId()))).status, 404)

      const noImage = await request(app).post(url(lead.id, item.id)).send(add(anUnknownId()))
      assert.equal(noImage.status, 422, noImage.text)

      const loose = await request(app)
        .post(url(lead.id, item.id))
        .send({ image_id: anUnknownId(), sort_order: 3 })
      assert.equal(loose.status, 400, loose.text)

      const notUuid = await request(app).get(url(lead.id, 'not-a-uuid'))
      assert.equal(notUuid.status, 400, notUuid.text)
    })
  })
})

test('a customer cannot reach the image routes', async () => {
  await inLeads(async (c) => {
    const lead = await aLead(c)
    const item = await anEstimateItem(c, lead.id)
    await as({ ...TEST_CUSTOMER, role: 'user' }, async () => {
      assert.equal((await request(app).get(url(lead.id, item.id))).status, 403)
      assert.equal(
        (await request(app).post(url(lead.id, item.id)).send(add(anUnknownId()))).status,
        403
      )
    })
  })
})
