// Transactions: the customer credit ledger. Reads and writes both go through payments.ledger.
import * as ledger from "#db/transactions/repo.ts";
import { toWire, type TransactionWire } from "#domain/transactions/compose.ts";
import type { NewLedgerEntry } from "#db/transactions/repo.ts";
import type { Executor } from "#shared/db/executor.ts";

// One row, not the history — deliberately, though it's wrong. get_transactions is unlimited and ordered but both prior implementations ended in rows[0], so a customer with 11 ledger rows gets one. Pinned by replay.test.ts as a response SHAPE that must not move during a schema migration, even though nothing in the frontend currently calls this endpoint — a deliberate prior decision isn't this session's to reverse. Recorded for Jacob.
// history() below already returns the full list, so fixing this is a one-line change when he decides.
export async function getTransactionHistory(user_id: string): Promise<TransactionWire | undefined> {
  return (await history(user_id))[0];
}

// The whole history, which is what get_transactions ought to return.
export async function history(user_id: string): Promise<TransactionWire[]> {
  return await toWire(await ledger.byUser(user_id));
}

// The refund FACT (D211): whether a Credit was ever logged against this
// order. The abandonment sweep guards its refund on this, never on a status.
export async function hasCreditFor(order_id: string, executor?: Executor): Promise<boolean> {
  return await ledger.hasCreditFor(order_id, executor);
}

// The caller's transaction, always - a ledger row for an order that rolls
// back must roll back with it, so this never opens one of its own.
export async function addTransactionLog(row: NewLedgerEntry, tx: Executor): Promise<void> {
  await ledger.create(row, tx);
}
