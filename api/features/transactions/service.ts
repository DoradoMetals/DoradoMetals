// Transactions: the customer credit ledger.
//
// Reads come from payments.ledger; writes go to both schemas in one
// transaction under an id the service generates.
//
// TAKES THE CALLER'S EXECUTOR. addTransactionLog is called from inside the
// transactions that create and complete orders - a ledger row for an order that
// rolls back must roll back with it.
import { randomUUID } from "node:crypto";
import withTransaction from "#shared/db/withTransaction.js";
import * as ledger from "#features/transactions/repo.ts";
import * as legacy from "#features/transactions/legacy.repo.ts";
import { toWire, type TransactionWire } from "#features/transactions/compose.ts";
import type { Executor } from "#features/transactions/repo.ts";

// ONE ROW, NOT THE HISTORY - AND THAT IS DELIBERATE, though it is wrong.
//
// The endpoint is called get_transactions and the query is unlimited and
// ordered, but both previous implementations ended in rows[0], so a customer
// with 11 ledger rows receives one. I changed it, and changed it back:
// features/transactions/replay.test.js pins this shape with the reason - "it is
// a response SHAPE, and shapes do not move during a schema migration. Asserted
// so the change is deliberate."
//
// That holds even though nothing in the frontend calls this endpoint (checked).
// The standing rule has no not-currently-consumed exemption, and a deliberate
// prior decision is not mine to reverse overnight. Recorded for Jacob instead.
//
// history() below returns what the endpoint ought to answer with, so fixing
// this is a one-line change here when he decides.
export async function getTransactionHistory(user_id: string): Promise<TransactionWire | undefined> {
  return (await history(user_id))[0];
}

// The whole history, which is what get_transactions ought to return.
export async function history(user_id: string): Promise<TransactionWire[]> {
  return await toWire(await ledger.byUser(user_id));
}

export async function addTransactionLog(
  // user_id is nullable at the call site: purchase-orders reads it off an order
  // whose user_id the wire declares nullable. A ledger row with no user is
  // written rather than refused, exactly as before - payments.ledger.user_id
  // permits it, and dropping the row would lose the money movement entirely.
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
    await legacy.create(
      id, user_id, transaction_type,
      purchase_order_id ?? null, sales_order_id ?? null, amount, c
    );
    await ledger.create(id, user_id, transaction_type, order_id, amount, c);
  };
  return executor ? write(executor) : withTransaction(write);
}
