import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type {
  AssayResultsDocument,
  Pdf,
  RateSheetDocument,
  StoredDocument,
} from '@dorado/contracts'
import {
  AssayResultsDocument as AssayResults,
  RateSheetDocument as RateSheet,
} from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export type PdfRow = Pick<Pdf, 'id' | 'path' | 'size_bytes' | 'checksum' | 'created_at'>

export type NewPdf = {
  kind: Pdf['kind']
  order_id: string | null
  refining_order_id: string | null
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

export async function latestForRefining(
  kind: Pdf['kind'],
  refining_order_id: string,
  executor?: Executor
): Promise<PdfRow | null> {
  const { rows } = await query<PdfRow>(
    sql('latest_for_refining'),
    [refining_order_id, kind],
    executor
  )
  return rows[0] ?? null
}

export async function storedKinds(
  order_id: string | null,
  refining_order_id: string | null,
  executor?: Executor
): Promise<StoredDocument[]> {
  const { rows } = await query<StoredDocument>(
    sql('stored_kinds'),
    [order_id, refining_order_id],
    executor
  )
  return rows
}

export async function create(row: NewPdf, executor?: Executor): Promise<{ id: string }> {
  const { rows } = await query<{ id: string }>(
    sql('create'),
    [row.kind, row.order_id, row.refining_order_id, row.path, row.size_bytes, row.checksum],
    executor
  )
  return rows[0]
}

async function contentOf(name: string, params: unknown[], executor?: Executor): Promise<unknown> {
  const { rows } = await query<{ content: unknown }>(sql(name), params, executor)
  return rows[0]?.content
}

export async function assayResults(
  order_id: string,
  executor?: Executor
): Promise<AssayResultsDocument | null> {
  const row = await contentOf('content_assay_results', [order_id], executor)
  return row === undefined ? null : AssayResults.parse(row)
}

export async function rateSheet(executor?: Executor): Promise<RateSheetDocument> {
  const row = await contentOf('content_rate_sheet', [], executor)
  return RateSheet.parse(row)
}
