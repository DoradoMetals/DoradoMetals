// Ledger row -> wire shape: one order_id + the order's own direction.
import * as ordersRepo from "#db/orders/repo.ts";
import type { LedgerRow } from "#db/transactions/repo.ts";
import type { Direction } from "@dorado/contracts";
import type { PoolClient } from "pg";

export type TransactionWire = {
  id: string; user_id: string; transaction_type: string;
  order_id: string | null; direction: Direction | null;
  amount: LedgerRow["amount"];
  occurred_at: LedgerRow["occurred_at"];
  created_at: LedgerRow["created_at"];
  updated_at: LedgerRow["updated_at"];
};

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
