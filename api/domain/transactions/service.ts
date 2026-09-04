// Transactions: the customer credit ledger. Reads and writes both go through
// payments.ledger, and the read arrives in the wire's own names (by_user.sql
// joins the order for its direction), so there is no compose step.
import * as ledger from "#db/transactions/repo.ts";
import type { AccountTransaction, LedgerEntryPatch } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

// THE WHOLE HISTORY, NEWEST FIRST.
//
// GET /transactions used to answer ONE ROW - `rows[0]` of an unlimited ordered
// read - so a customer with eleven ledger entries was told about one of them.
// It was documented as deliberate ("a response SHAPE that must not move during
// a schema migration") and recorded for Jacob; ruling 44 retires that caution,
// the endpoint has no frontend consumer to break, and a ledger that reports one
// entry is not a ledger. It answers the list.
export async function history(user_id: string): Promise<AccountTransaction[]> {
  return await ledger.byUser(user_id);
}

// The refund FACT (D211): whether a Credit was ever logged against this
// order. The abandonment sweep guards its refund on this, never on a status.
export async function hasCreditFor(order_id: string, executor?: Executor): Promise<boolean> {
  return await ledger.hasCreditFor(order_id, executor);
}

// The caller's transaction, always - a ledger row for an order that rolls
// back must roll back with it, so this never opens one of its own.
export async function addTransactionLog(row: LedgerEntryPatch, tx: Executor): Promise<void> {
  await ledger.create(row, tx);
}
