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

// Tax that was charged must land on a state's row. A state with no
// tax.sales_tax row cannot have reached nexus, so it can only ever be charged
// zero - and an accrual of zero that matches nothing is the normal case, not a
// fault. Anything else is a charge recorded nowhere (MP F3).
export function assertAccrued(accrued: boolean, amount: number, state: string): void {
  if (!accrued && amount > 0) {
    throw new Invalid(
      `${amount.toFixed(2)} of sales tax was charged for ${state}, which has no ` +
        `tax.sales_tax row to owe it`
    )
  }
}
