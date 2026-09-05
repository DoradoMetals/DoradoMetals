import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Image } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export type NewImage = {
  user_id: string
  bucket: string
  path: string
  filename: string
  mime_type?: string | null
  size_bytes?: number | null
}

const values = (i: NewImage) => [
  i.user_id,
  i.bucket,
  i.path,
  i.filename,
  i.mime_type ?? null,
  i.size_bytes ?? null,
]

export async function getOne(id: string, executor?: Executor): Promise<Image | undefined> {
  const { rows } = await query<Image>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function list(executor?: Executor): Promise<Image[]> {
  const { rows } = await query<Image>(sql('get_all'), [], executor)
  return rows
}

export async function listFor(userId: string, executor?: Executor): Promise<Image[]> {
  const { rows } = await query<Image>(sql('by_user'), [userId], executor)
  return rows
}

export async function create(image: NewImage, executor?: Executor): Promise<Image> {
  const { rows } = await query<Image>(sql('create'), values(image), executor)
  return rows[0]
}

export async function remove(id: string, user_id: string, executor?: Executor): Promise<boolean> {
  const result = await query(sql('delete'), [id, user_id], executor)
  return result.rowCount === 1
}
