import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import pool from '#pool'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as images from '#db/media/images/repo.ts'
import * as service from '#accounts/images/service.ts'

afterAll(async () => {
  await pool.end()
})

function assertPresignedUrl(raw: string, objectKey: string): void {
  assert.equal(typeof raw, 'string', 'the service should return a presigned URL string')

  const url = new URL(raw)
  const endpoint = new URL(process.env.S3_ENDPOINT as string)
  const bucket = process.env.S3_BUCKET as string

  assert.equal(
    url.hostname,
    endpoint.hostname,
    'the presigned URL should point at the configured S3 endpoint'
  )
  assert.ok(
    url.pathname.includes(`/${bucket}/`) || url.hostname.startsWith(`${bucket}.`),
    'the presigned URL should name the bucket, in its path or its host'
  )
  assert.ok(
    url.pathname.includes(objectKey) || url.hostname.includes(objectKey),
    'the presigned URL should name the object key'
  )
}

test('uploadImage writes its row before it ever reaches the storage provider', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)

      const result = await service.uploadImage(user.id, 'photo.jpg', 'image/jpeg', 1024)

      const { rows } = await c.query(
        `SELECT user_id, filename FROM media.images WHERE user_id = $1`,
        [user.id]
      )
      assert.equal(
        rows.length,
        1,
        'uploadImage did not write its row before signing the upload url'
      )
      assert.match(
        rows[0].filename,
        /photo\.jpg$/,
        'the original filename should survive at the end'
      )

      assertPresignedUrl(result.uploadUrl, `${user.id}/${rows[0].filename}`)
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
      const url = await service.getUrl(row.id)
      assertPresignedUrl(url, `${row.path}${row.filename}`)
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
      const attached = await service.attachUrlToImage(row)

      assert.equal(attached.id, row.id)
      assert.equal(attached.user_id, row.user_id)
      assert.equal(attached.bucket, row.bucket)
      assert.equal(attached.path, row.path)
      assert.equal(attached.filename, row.filename)
      assertPresignedUrl(attached.url, `${row.path}${row.filename}`)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('getTestImages maps every row through attachUrlToImage', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const row = await images.create(
        {
          user_id: user.id,
          bucket: 'images',
          path: `${user.id}/`,
          filename: 'list-me.jpg',
          mime_type: 'image/jpeg',
        },
        c
      )

      const all = await service.getTestImages()
      const mine = all.find((img) => img.id === row.id)

      assert.ok(mine, 'getTestImages did not return the row written inside this transaction')
      assert.equal(mine.filename, row.filename)
      assertPresignedUrl(mine.url, `${row.path}${row.filename}`)
    },
    { actor: TEST_ACTOR.id }
  )
})
