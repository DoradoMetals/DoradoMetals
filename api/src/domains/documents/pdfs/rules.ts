import { Invalid, NotFound } from '#shared/errors.ts'
import type { OrderDocument } from '@dorado/contracts'

export function assertOrder<T>(order: T | null | undefined, order_id: string): asserts order is T {
  if (!order) throw new NotFound(`no order ${order_id}`)
}

export function assertEntitled(
  entitled: boolean,
  order_id: string | null
): asserts order_id is string {
  if (!entitled || order_id === null) throw new NotFound(`no order ${order_id ?? ''}`)
}

export function assertAssetsDir(dir: string | null, searchedFrom: string): asserts dir is string {
  if (!dir) throw new Error(`no shared/assets directory above ${searchedFrom}`)
}

export function assertNotTestRun(isTest: boolean): void {
  if (isTest) {
    throw new Error('refusing to read real object storage during a test run - pass a StoredReader')
  }
}

export function assertChecksum(matches: boolean, checksum: string): void {
  if (!matches) throw new Error(`bytes do not match stored checksum ${checksum}`)
}

// Send only works on a row the card marks available: a kind with a renderer, or
// a kind somebody has imported a file for.
export function assertDocumentAvailable(
  document: OrderDocument | undefined,
  kind: string
): asserts document is OrderDocument {
  if (!document) throw new NotFound(`no ${kind} document on this order`)
  if (!document.available) {
    throw new Invalid(
      `the ${document.name} is not available yet - import a file for it, or finalize the order`
    )
  }
}

export function assertRendered(
  bytes: Uint8Array | null,
  name: string
): asserts bytes is Uint8Array {
  if (!bytes) throw new NotFound(`the ${name} could not be produced`)
}

export function assertUpload(bytes: Uint8Array | null | undefined): asserts bytes is Uint8Array {
  if (!bytes || bytes.length === 0) {
    throw new Invalid('the request carries no file - send it as multipart/form-data')
  }
}

export function assertAssayResults<T>(
  doc: T | null | undefined,
  order_id: string
): asserts doc is T {
  if (!doc) throw new NotFound(`no assay results for order ${order_id}`)
}
