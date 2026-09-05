import { Invalid, NotFound } from '#shared/errors.ts'

export function assertNamesAField(patch: object): void {
  if (Object.keys(patch).length === 0) {
    throw new Invalid('the document names no field to write')
  }
}

export function assertRefinerOrder<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no refiner order ${id}`)
}
