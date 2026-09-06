import * as ledger from '#db/transactions/repo.ts'
import type { AccountTransaction, LedgerEntry, LedgerEntryPatch } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

export async function history(user_id: string): Promise<AccountTransaction[]> {
  return await ledger.byUser(user_id)
}

export async function hasCreditFor(order_id: string, executor?: Executor): Promise<boolean> {
  return await ledger.hasCreditFor(order_id, executor)
}

export async function addTransactionLog(row: LedgerEntryPatch, tx: Executor): Promise<void> {
  await ledger.create(row, tx)
}

export async function resolveReservation(
  order_id: string,
  type: 'Debit' | 'Released',
  tx: Executor
): Promise<LedgerEntry | undefined> {
  return await ledger.resolveReservation(order_id, type, tx)
}
