import * as tax from '#db/sales-tax/repo.ts'
import * as rules from '#pricing/rules.ts'
import type { Executor } from '#shared/db/executor.ts'

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
