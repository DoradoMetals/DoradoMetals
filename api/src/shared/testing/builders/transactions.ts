import type { PoolClient } from 'pg'
import * as ledger from '#db/transactions/repo.ts'
import type { LedgerEntry, LedgerEntryPatch } from '@dorado/contracts'
import type { BuiltUser } from '#shared/testing/builders/users.ts'

export type { LedgerEntry } from '@dorado/contracts'

export async function aLedgerEntry(
  c: PoolClient,
  user: BuiltUser | { id: string },
  row: Partial<LedgerEntryPatch> = {}
): Promise<LedgerEntry> {
  return await ledger.create(
    {
      user_id: user.id,
      type: row.type ?? 'Credit',
      order_id: row.order_id ?? null,
      amount: row.amount ?? 100,
    },
    c
  )
}
