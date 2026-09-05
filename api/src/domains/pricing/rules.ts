import { Invalid, NotFound } from '#shared/errors.ts'

export function assertPriced<T>(row: T | null | undefined, what: string): asserts row is T {
  if (!row) throw new NotFound(`nothing to price: ${what}`)
}

export function assertPriceable(unpriceable: string[], what: string): void {
  if (unpriceable.length > 0) {
    throw new Invalid(
      `${what} cannot be priced - no live quote for ${unpriceable.length} line(s): ` +
        unpriceable.join(', ')
    )
  }
}
