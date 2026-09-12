import { createHash } from 'node:crypto'
import minio from '#providers/s3/minio.ts'
import { isTestRun } from '#shared/testing/is-test-run.ts'
import { linkableOrderId } from '#documents/emails/record.ts'
import * as pdfs from '#db/media/pdfs/repo.ts'
import type { PdfRow } from '#db/media/pdfs/repo.ts'
import type { PoolClient } from 'pg'
import { attempt } from '#shared/attempt.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import type { PdfKind } from '@dorado/contracts'

type Executor = PoolClient | undefined

export type { PdfKind } from '@dorado/contracts'

export async function latestPdf(
  kind: PdfKind,
  order_id: string,
  executor?: Executor
): Promise<PdfRow | null> {
  return await pdfs.latestOfKind(kind, order_id, executor)
}

export async function latestForRefining(
  kind: PdfKind,
  refining_order_id: string,
  executor?: Executor
): Promise<PdfRow | null> {
  return await pdfs.latestForRefining(kind, refining_order_id, executor)
}

export async function persistPdf(
  kind: PdfKind,
  order_id: string | null,
  bytes: Uint8Array,
  executor?: Executor
): Promise<string | null> {
  if (isTestRun() && !executor) return null
  const id = await attempt(`persist ${kind} PDF for order ${order_id ?? '?'}`, async () => {
    const buffer = Buffer.from(bytes)
    const checksum = createHash('sha256').update(buffer).digest('hex')
    const path = `pdfs/${order_id ?? 'unattached'}/${kind}-${checksum}.pdf`

    if (!isTestRun()) {
      await minio.putObject(process.env.MINIO_BUCKET as string, path, buffer)
    }

    const linkable = await linkableOrderId(order_id, executor)
    const written = await pdfs.create(
      {
        kind,
        order_id: linkable,
        refining_order_id: null,
        path,
        size_bytes: buffer.length,
        checksum,
      },
      executor
    )
    return written.id
  })
  return id ?? null
}

export async function storeUpload(
  kind: PdfKind,
  order_id: string | null,
  refining_order_id: string | null,
  bytes: Uint8Array
): Promise<string> {
  const buffer = Buffer.from(bytes)
  const checksum = createHash('sha256').update(buffer).digest('hex')
  const path = `pdfs/${order_id ?? refining_order_id ?? 'unattached'}/${kind}-${checksum}.pdf`
  if (!isTestRun()) {
    await minio.putObject(process.env.MINIO_BUCKET as string, path, buffer)
  }
  const linkable = order_id === null ? null : await linkableOrderId(order_id)
  const written = await withTransaction((tx) =>
    pdfs.create(
      { kind, order_id: linkable, refining_order_id, path, size_bytes: buffer.length, checksum },
      tx
    )
  )
  return written.id
}
