import { createHash } from 'node:crypto'
import type { PoolClient } from 'pg'

import minio from '#providers/s3/minio.ts'
import { isTestRun } from '#shared/testing/is-test-run.ts'
import { orderOwnedBy } from '#shared/middleware/ownership.ts'
import { linkableOrderId } from '#documents/emails/record.ts'
import { latestPdf, persistPdf } from '#documents/pdfs/store.ts'
import type { PdfRow } from '#db/media/pdfs/repo.ts'
import type { PdfKind } from '#documents/pdfs/store.ts'
import { attempt } from '#shared/attempt.ts'
import * as rules from '#documents/pdfs/rules.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type StoredReader = (path: string) => Promise<Buffer>

const readFromStorage: StoredReader = async (path) => {
  rules.assertNotTestRun(isTestRun())
  const stream = await minio.getObject(process.env.MINIO_BUCKET as string, path)
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

type ServeInput = {
  kind: PdfKind
  order_id?: unknown
  caller?: { id: string; role?: string | null } | null
  render: () => Promise<Uint8Array>
}

type ServedDocument = {
  bytes: Uint8Array
  source: 'stored' | 'rendered'
}

// The bytes of a file already stored, checksum-verified. Used by the Send path,
// which has already established the caller is an admin (GAP 24).
export async function storedBytes(
  row: PdfRow,
  storage: StoredReader = readFromStorage
): Promise<Uint8Array | null> {
  const bytes = await attempt(`read stored document ${row.id}`, async () => {
    const b = await storage(row.path)
    if (row.checksum) rules.assertChecksum(sha256(b) === row.checksum, row.checksum)
    return b
  })
  return bytes ?? null
}

export async function serveOrderDocument(
  { kind, order_id, caller, render }: ServeInput,
  storage: StoredReader = readFromStorage,
  executor?: PoolClient
): Promise<ServedDocument> {
  const orderId = typeof order_id === 'string' && UUID.test(order_id) ? order_id : null

  const entitled =
    orderId !== null &&
    !!caller?.id &&
    (caller.role === 'admin' || (await orderOwnedBy(orderId, caller.id, executor)))

  rules.assertEntitled(entitled, orderId)

  const row = await latestPdf(kind, orderId, executor)

  if (row) {
    const bytes = await attempt(`read stored ${kind} ${row.id} for order ${orderId}`, async () => {
      const b = await storage(row.path)
      if (row.checksum) rules.assertChecksum(sha256(b) === row.checksum, row.checksum)
      return b
    })
    if (bytes) return { bytes, source: 'stored' }
    return { bytes: await render(), source: 'rendered' }
  }

  const bytes = await render()
  if (await linkableOrderId(orderId, executor)) {
    await persistPdf(kind, orderId, bytes, executor)
  }
  return { bytes, source: 'rendered' }
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
