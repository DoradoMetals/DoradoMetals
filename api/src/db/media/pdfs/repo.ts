import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Pdf } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export type PdfRow = Pick<Pdf, 'id' | 'path' | 'size_bytes' | 'checksum' | 'created_at'>

export type NewPdf = {
  kind: Pdf['kind']
  order_id: string | null
  path: string
  size_bytes: number
  checksum: string
}

export async function latestOfKind(
  kind: Pdf['kind'],
  order_id: string,
  executor?: Executor
): Promise<PdfRow | null> {
  const { rows } = await query<PdfRow>(sql('latest'), [order_id, kind], executor)
  return rows[0] ?? null
}

export async function create(row: NewPdf, executor?: Executor): Promise<{ id: string }> {
  const { rows } = await query<{ id: string }>(
    sql('create'),
    [row.kind, row.order_id, row.path, row.size_bytes, row.checksum],
    executor
  )
  return rows[0]
}
