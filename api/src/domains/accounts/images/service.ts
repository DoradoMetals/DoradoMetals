import { randomBytes } from 'node:crypto'
import minio from '#providers/storage/s3/minio.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import * as images from '#db/media/images/repo.ts'
import type { NewImage } from '#db/media/images/repo.ts'
import * as rules from '#accounts/images/rules.ts'
import type { Image } from '@dorado/contracts'
import { withDecisions } from '#shared/views.ts'

const PUT_TTL_SECONDS = 60 * 5
const GET_TTL_SECONDS = 60 * 10

export async function uploadImage(
  user_id: string,
  filename: string,
  mime_type: string,
  size_bytes: number | null
): Promise<{ id: string; uploadUrl: string }> {
  const bucket = process.env.MINIO_BUCKET as string

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

export async function getUrlFor(image_id: string, user_id?: string): Promise<string | null> {
  const img = await ownedBy(image_id, user_id)
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
