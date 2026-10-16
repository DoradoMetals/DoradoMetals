import { createHash } from 'node:crypto'
import type { PoolClient } from 'pg'

import minio from '#providers/s3/minio.ts'
import { isTestRun } from '#shared/testing/is-test-run.ts'
import { orderOwnedBy } from '#shared/middleware/ownership.ts'
import * as orders from '#orders/service.ts'
import type { PdfRow } from '#db/media/pdfs/repo.ts'
import type { PdfKind } from '#documents/pdfs/store.ts'
import { attempt } from '#shared/attempt.ts'
import * as rules from '#documents/pdfs/rules.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type StoredReader = (path: string) => Promise<Buffer>

const readFromStorage: StoredReader = async (path) => {
  rules.assertNotTestRun(isTestRun())
  const stream = await minio.getObject(process.env.S3_BUCKET as string, path)
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
}

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
  executor?: PoolClient
): Promise<ServedDocument> {
  const orderId = typeof order_id === 'string' && UUID.test(order_id) ? order_id : null

  const entitled =
    orderId !== null &&
    !!caller?.id &&
    (caller.role === 'admin' || (await orderOwnedBy(orderId, caller.id, executor)))

  rules.assertEntitled(entitled, orderId)

  const listed = rules.listedKind(kind)
  rules.assertServable(
    (await orders.documentsFor(orderId)).find((row) => row.kind === kind || row.kind === listed),
    kind
  )

  return { bytes: await render() }
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
