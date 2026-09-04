// Ledger row -> wire shape: one order_id + the order's own direction.
import * as ordersRepo from "#db/orders/repo.ts";
import type { LedgerRow } from "#db/transactions/repo.ts";
import type { AccountTransaction } from "@dorado/contracts";
import type { PoolClient } from "pg";

// The shape lives in the contract (AccountTransaction), not here: a type
// that crosses to a client is a contract's, and a local copy is the drift.
export type TransactionWire = AccountTransaction;

export async function toWire(rows: LedgerRow[], executor?: PoolClient): Promise<TransactionWire[]> {
  const orderIds = rows.map((r) => r.order_id).filter((x): x is string => !!x);
  const dirs = await ordersRepo.directionsById(orderIds, executor);
  return rows.map((l) => ({
    id: l.id, user_id: l.user_id, transaction_type: l.type,
    order_id: l.order_id,
    direction: l.order_id ? (dirs.get(l.order_id) ?? null) : null,
    amount: l.amount, occurred_at: l.occurred_at,
    created_at: l.created_at, updated_at: l.updated_at,
  }));
}
