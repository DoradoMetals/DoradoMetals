import { NotFound } from '#shared/errors.ts'

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
