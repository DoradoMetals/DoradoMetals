// The customer credit ledger, against payments.ledger.
//
// Two columns are reshaped by the new schema and projected back here, so the
// wire shape is unchanged:
//
//   type             -> transaction_type
//   order_id         -> purchase_order_id or sales_order_id, decided by
//                       orders.orders.direction
//
// An entry whose order was deleted keeps a null order_id - exchange's foreign
// keys are ON DELETE SET NULL and one production row is already in that state -
// so the join is a LEFT JOIN and both columns come back null, exactly as
// exchange returns them.
import query from "#shared/db/query.js";
import type { payments } from "@dorado/contracts";
import type { PoolClient, QueryResult } from "pg";

// Repos take an optional executor so a caller can pull them into its
// transaction; without one they run on the pool.
type Executor = PoolClient | undefined;

// payments.ledger is where exchange.account_transactions lands - the customer
// credit ledger. Production holds 17 rows across 8 customers, $66,999.32.
export type LedgerRow = payments.LedgerRow;

import { addFunds, removeFunds } from "#features/transactions/repo.exchange.js";

// The balance lives on exchange.users either way; 056's trigger mirrors it.
export { addFunds, removeFunds };

export async function getTransactionHistory(
  user_id: string
): Promise<LedgerRow | undefined> {
  const sql = `
    SELECT
      l.id,
      l.user_id,
      l.type AS transaction_type,
      CASE WHEN o.direction = 'purchase' THEN l.order_id END AS purchase_order_id,
      CASE WHEN o.direction = 'sale'     THEN l.order_id END AS sales_order_id,
      l.amount,
      l.occurred_at,
      l.created_at,
      l.updated_at
    FROM payments.ledger l
    LEFT JOIN orders.orders o ON o.id = l.order_id
    WHERE l.user_id = $1
    ORDER BY l.occurred_at, l.id
  `;
  const values = [user_id];
  const result = await query<LedgerRow>(sql, values);
  return result.rows[0];
}

// The two order ids are collapsed into payments.ledger's single order_id -
// exchange kept purchase_order_id and sales_order_id as separate columns, and a
// ledger row belongs to exactly one order either way. Both are accepted so the
// caller does not have to know which schema it is writing to.
export async function addTransactionLog(
  user_id: string,
  transaction_type: string,
  purchase_order_id: string | null | undefined,
  sales_order_id: string | null | undefined,
  amount: number,
  client?: Executor
): Promise<QueryResult<LedgerRow>> {
  const sql = `
    INSERT INTO payments.ledger (user_id, type, order_id, amount)
    VALUES ($1, $2, $3, $4)
  `;
  const values = [
    user_id,
    transaction_type,
    purchase_order_id ?? sales_order_id ?? null,
    amount,
  ];
  return await query<LedgerRow>(sql, values, client);
}
