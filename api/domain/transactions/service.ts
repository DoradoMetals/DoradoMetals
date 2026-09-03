// Transactions: the customer credit ledger. Reads and writes both go through payments.ledger, under an id the service generates.
// Takes the caller's executor — addTransactionLog is called from inside the transactions that create and complete orders, so a ledger row for an order that rolls back must roll back with it.
import { randomUUID } from "node:crypto";
import withTransaction from "#shared/db/withTransaction.ts";
import * as ledger from "#db/transactions/repo.ts";
import { toWire, type TransactionWire } from "#domain/transactions/compose.ts";
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

export async function addTransactionLog(
  // user_id is nullable at the call site (an order's user_id can be null on the wire) — a ledger row with no user is written rather than refused, since dropping it would lose the money movement entirely.
  user_id: string | null,
  transaction_type: string,
  purchase_order_id: string | null | undefined,
  sales_order_id: string | null | undefined,
  amount: number | null,
  executor?: Executor
): Promise<void> {
  const id = randomUUID();
  // A ledger row belongs to exactly one order, so the two columns collapse into
  // one on the way in and are separated again by direction on the way out.
  const order_id = purchase_order_id ?? sales_order_id ?? null;

  const write = async (c: Executor) => {
    await ledger.create(id, user_id, transaction_type, order_id, amount, c);
  };
  return executor ? write(executor) : withTransaction(write);
}
