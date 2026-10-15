import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import * as lotImages from '#db/inventory/lot-images/repo.ts'
import * as lots from '#db/inventory/lots/repo.ts'
import * as images from '#db/media/images/repo.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'

afterAll(async () => {
  await pool.end()
})

const inLots = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS })

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

test('images link to a lot in order, a second link of one image is a no-op, and unlink keeps the image', async () => {
  await inLots(async (c) => {
    const user = await aUser(c)
    const lot = await lots.create({ metal_id: 'Gold', pre_melt: 5, purity: 0.9 }, c)
    const first = await anImage(c, user.id, 'first.jpg')
    const second = await anImage(c, user.id, 'second.jpg')

    const linked = await lotImages.create(lot.id, first.id, c)
    assert.equal(linked.sort_order, 0)
    assert.equal(linked.created_by_id, TEST_ACTOR.id, 'the audit trigger stamps the actor')
    assert.equal((await lotImages.create(lot.id, second.id, c)).sort_order, 1)
    assert.equal((await lotImages.create(lot.id, first.id, c)).sort_order, 0)

    assert.deepEqual(await lotImages.list(lot.id, c), [
      { image_id: first.id, sort_order: 0 },
      { image_id: second.id, sort_order: 1 },
    ])

    assert.equal(await lotImages.remove(lot.id, first.id, c), true)
    assert.equal(await lotImages.remove(lot.id, first.id, c), false)
    assert.deepEqual(await lotImages.list(lot.id, c), [{ image_id: second.id, sort_order: 1 }])
    assert.ok(await images.getOne(first.id, c), 'unlinking deleted the image itself')
  })
})

test('cover links an image at 0 and moves the rest back; a cover already at 0 moves nothing', async () => {
  await inLots(async (c) => {
    const user = await aUser(c)
    const lot = await lots.create({ metal_id: 'Gold', pre_melt: 5, purity: 0.9 }, c)
    const first = await anImage(c, user.id, 'first.jpg')
    const second = await anImage(c, user.id, 'second.jpg')
    await lotImages.create(lot.id, first.id, c)

    assert.equal((await lotImages.cover(lot.id, second.id, c)).sort_order, 0)
    await lots.update(lot.id, { image_id: second.id }, c)
    assert.deepEqual(await lotImages.list(lot.id, c), [
      { image_id: second.id, sort_order: 0 },
      { image_id: first.id, sort_order: 1 },
    ])

    await lotImages.cover(lot.id, second.id, c)
    assert.deepEqual(await lotImages.list(lot.id, c), [
      { image_id: second.id, sort_order: 0 },
      { image_id: first.id, sort_order: 1 },
    ])
  })
})

test('the migration backfill gave every lot image_id a link at sort_order 0', async () => {
  await inLots(async (c) => {
    const { rows } = await c.query<{ missing: number }>(
      `SELECT count(*)::int AS missing
         FROM inventory.lots l
         JOIN media.images i ON i.id = l.image_id
        WHERE NOT EXISTS (SELECT 1 FROM inventory.lot_images li
                           WHERE li.lot_id = l.id AND li.image_id = l.image_id)
          AND l.created_at < (SELECT min(applied_at) FROM exchange.schema_migrations
                               WHERE name = '284_a_lot_holds_a_set_of_images.sql')`
    )
    assert.equal(rows[0]!.missing, 0)
  })
})
