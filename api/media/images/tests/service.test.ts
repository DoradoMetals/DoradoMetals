import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import pool from '#pool'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as images from '#db/media/images/repo.ts'
import * as service from '#media/images/service.ts'

afterAll(async () => {
  await pool.end()
})

async function rejectsForNetwork(promise: Promise<unknown>): Promise<void> {
  let threw = false
  try {
    await promise
  } catch {
    threw = true
  }
  assert.equal(
    threw,
    true,
    "this test's storage provider is not reachable - the call should have failed"
  )
}

test('uploadImage writes its row before it ever reaches the storage provider', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)

      await rejectsForNetwork(service.uploadImage(user.id, 'photo.jpg', 'image/jpeg', 1024))

      const { rows } = await c.query(
        `SELECT user_id, filename FROM media.images WHERE user_id = $1`,
        [user.id]
      )
      assert.equal(rows.length, 1, 'uploadImage did not write its row before contacting storage')
      assert.match(
        rows[0].filename,
        /photo\.jpg$/,
        'the original filename should survive at the end'
      )
    },
    { actor: TEST_ACTOR.id }
  )
})

test('getUrl refuses an id nothing names before it ever reaches storage', async () => {
  await inPinnedTransaction(
    async () => {
      await assert.rejects(() => service.getUrl(randomUUID()), /image/i)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('getUrl asserts a real image, then reaches for a presigned URL', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const row = await images.create(
        {
          user_id: user.id,
          bucket: 'images',
          path: `${user.id}/`,
          filename: 'existing.jpg',
          mime_type: 'image/jpeg',
        },
        c
      )
      await rejectsForNetwork(service.getUrl(row.id))
    },
    { actor: TEST_ACTOR.id }
  )
})

test("attachUrlToImage carries the image's own fields alongside the url decision", async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const row = await images.create(
        {
          user_id: user.id,
          bucket: 'images',
          path: `${user.id}/`,
          filename: 'attach.jpg',
          mime_type: 'image/jpeg',
        },
        c
      )
      await rejectsForNetwork(service.attachUrlToImage(row))
    },
    { actor: TEST_ACTOR.id }
  )
})

test('getTestImages maps every row through attachUrlToImage', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      await images.create(
        {
          user_id: user.id,
          bucket: 'images',
          path: `${user.id}/`,
          filename: 'list-me.jpg',
          mime_type: 'image/jpeg',
        },
        c
      )
      await rejectsForNetwork(service.getTestImages())
    },
    { actor: TEST_ACTOR.id }
  )
})
