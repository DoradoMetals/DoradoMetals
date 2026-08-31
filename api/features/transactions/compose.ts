// The shape exchange returned, rebuilt from payments.ledger.
//
// exchange.account_transactions had transaction_type and BOTH order columns;
// payments.ledger has `type` and one `order_id`. Which of the two columns an
// order id belongs in is decided by the ORDER's direction, which is why the old
// query joined orders.orders to answer it with a CASE.
//
// Composed from ONE read of the orders involved rather than a join per query.
import query from "#shared/db/query.ts";
import type { LedgerRow } from "#features/transactions/repo.ts";
import type { PoolClient } from "pg";

export type TransactionWire = {
  id: string; user_id: string; transaction_type: string;
  purchase_order_id: string | null; sales_order_id: string | null;
  amount: LedgerRow["amount"];
  occurred_at: LedgerRow["occurred_at"];
  created_at: LedgerRow["created_at"];
  updated_at: LedgerRow["updated_at"];
};

// Direction by order id, for the ids actually present. A LEFT JOIN put null in
// BOTH columns when an order did not resolve, and so does this.
export async function directionsFor(
  ids: string[], executor?: PoolClient
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { rows } = await query<{ id: string; direction: string }>(
    `SELECT id, direction::text AS direction FROM orders.orders WHERE id = ANY($1)`,
    [unique],
    executor
  );
  return new Map(rows.map((r) => [r.id, r.direction]));
}

export async function toWire(rows: LedgerRow[], executor?: PoolClient): Promise<TransactionWire[]> {
  const dirs = await directionsFor(rows.map((r) => r.order_id).filter((x): x is string => !!x), executor);
  return rows.map((l) => {
    const d = l.order_id ? dirs.get(l.order_id) : undefined;
    return {
      id: l.id, user_id: l.user_id, transaction_type: l.type,
      purchase_order_id: d === "purchase" ? l.order_id : null,
      sales_order_id: d === "sale" ? l.order_id : null,
      amount: l.amount, occurred_at: l.occurred_at,
      created_at: l.created_at, updated_at: l.updated_at,
    };
  });
}
