import * as tax from '#db/sales-tax/repo.ts'
import * as rules from '#pricing/rules.ts'
import type { Executor } from '#shared/db/executor.ts'

// The state's running totals after one sale: what it is owed, and the volume
// that decides whether it is owed anything at all (ruling 87). A state with no
// tax.sales_tax row records nothing, and `rules.assertAccrued` refuses tax that
// would be charged against no row at all.
export async function updateStateSalesTax(
  amount: number,
  volume: number,
  state: string | null,
  tx: Executor
): Promise<boolean> {
  if (state === null) return false
  const accrued = await tax.accrue(amount, volume, state, tx)
  rules.assertAccrued(accrued, amount, state)
  return accrued
}
