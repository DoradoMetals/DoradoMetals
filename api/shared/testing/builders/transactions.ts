// aLedgerEntry - payments.ledger, the customer credit ledger.
//
// exchange.account_transactions is FROZEN (D212); domain/transactions reads
// and writes payments.ledger exclusively now (db/transactions/repo.ts), so a
// fixture that wrote the old table would be building a row the live code
// cannot produce or read back.
import type { PoolClient } from "pg";
import { anId } from "#shared/testing/builders/ids.ts";
import * as ledger from "#db/transactions/repo.ts";
import type { LedgerRow } from "#db/transactions/repo.ts";
import type { BuiltUser } from "#shared/testing/builders/users.ts";
import type { BuiltOrder } from "#shared/testing/builders/orders.ts";

export type { LedgerRow } from "#db/transactions/repo.ts";

export type LedgerEntryOptions = {
  id?: string;
  type?: string;
  order?: BuiltOrder | { id: string } | null;
  amount?: number | null;
};

export async function aLedgerEntry(
  c: PoolClient, user: BuiltUser | { id: string }, options: LedgerEntryOptions = {}
): Promise<LedgerRow> {
  return ledger.create(
    options.id ?? anId(),
    user.id,
    options.type ?? "Credit",
    options.order?.id ?? null,
    options.amount ?? 100,
    c
  );
}
