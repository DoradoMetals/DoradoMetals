import { createHash, randomBytes } from 'node:crypto'
import { isTestRun } from '#shared/testing/is-test-run.ts'
import minio from '#providers/s3/minio.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import * as images from '#db/media/images/repo.ts'
import type { NewImage } from '#db/media/images/repo.ts'
import * as rules from '#accounts/images/rules.ts'
import { Image as ImageRow } from '@dorado/contracts'
import type { Image, SignedImage } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'
import { withDecisions } from '#shared/views.ts'

const PUT_TTL_SECONDS = 60 * 5
const GET_TTL_SECONDS = 60 * 10

export async function uploadImage(
  user_id: string,
  filename: string,
  mime_type: string,
  size_bytes: number | null
): Promise<{ id: string; uploadUrl: string }> {
  const bucket = process.env.S3_BUCKET as string

  const originalName =
    String(filename ?? '')
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .slice(-80) || 'upload'
  const image: NewImage = {
    user_id,
    bucket,
    path: `${user_id}/`,
    filename: `${randomBytes(16).toString('hex')}-${originalName}`,
    mime_type,
    size_bytes,
  }

  const row = await withTransaction(async (client) => {
    const written = await images.create(image, client)
    return written
  })

  const uploadUrl = await minio.presignedPutObject(
    bucket,
    image.path + image.filename,
    PUT_TTL_SECONDS
  )

  return { id: row.id, uploadUrl }
}

async function ownedBy(image_id: string, user_id?: string): Promise<Image | null> {
  const img = await images.getOne(image_id)
  if (!img) return null
  if (!user_id || img.user_id !== user_id) return null
  return img
}

const presign = (img: Image) =>
  minio.presignedGetObject(img.bucket, img.path + img.filename, GET_TTL_SECONDS)

export async function getUrl(image_id: string): Promise<string> {
  const img = await images.getOne(image_id)
  rules.assertImage(img, image_id)
  return await presign(img)
}

export async function signed(image_ids: readonly string[]): Promise<SignedImage[]> {
  return await Promise.all(
    image_ids.map(async (image_id) => {
      const img = await images.getOne(image_id)
      rules.assertImage(img, image_id)
      return withDecisions(ImageRow.pick({ id: true }).parse(img), { url: await presign(img) })
    })
  )
}

export async function putBytes(
  user_id: string | null,
  bytes: Buffer,
  mime_type: string
): Promise<NewImage> {
  const checksum = createHash('sha256').update(bytes).digest('hex')
  const image: NewImage = {
    user_id,
    bucket: process.env.S3_BUCKET as string,
    path: `${user_id ?? 'inbound'}/`,
    filename: checksum,
    mime_type,
    size_bytes: bytes.length,
    checksum,
  }
  if (!isTestRun()) {
    await minio.putObject(image.bucket, image.path + image.filename, bytes, bytes.length, {
      'Content-Type': mime_type,
    })
  }
  return image
}

export async function record(image: NewImage, tx: Executor): Promise<Image> {
  return await images.create(image, tx)
}

export async function getUrlFor(
  image_id: string,
  user_id?: string,
  is_admin = false
): Promise<string | null> {
  const img = is_admin
    ? ((await images.getOne(image_id)) ?? null)
    : await ownedBy(image_id, user_id)
  if (!img) return null
  return await presign(img)
}

export async function attachUrlToImage(image: Image): Promise<Image & { url: string }> {
  return withDecisions(image, { url: await presign(image) })
}

export async function getTestImages(): Promise<(Image & { url: string })[]> {
  const rows = await images.list()
  return Promise.all(rows.map(attachUrlToImage))
}

export async function deleteImage(id: string, user_id?: string): Promise<{ success: true } | null> {
  const img = await ownedBy(id, user_id)
  if (!img) return null

  await withTransaction(async (client) => {
    await images.remove(id, user_id as string, client)
  })

  await minio.removeObject(img.bucket, img.path + img.filename)

  return { success: true }
}
