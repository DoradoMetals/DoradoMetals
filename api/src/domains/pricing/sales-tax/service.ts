import * as tax from '#db/sales-tax/repo.ts'
import type { Executor } from '#shared/db/executor.ts'

export async function updateStateSalesTax(
  amount: number,
  state: string | null,
  tx: Executor
): Promise<void> {
  if (state === null) return
  await tax.accrue(amount, state, tx)
}
