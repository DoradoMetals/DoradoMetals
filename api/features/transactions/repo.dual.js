// Writes the ledger entry to both schemas, reads exchange.
//
// exchange stays authoritative while the switch is `dual`, so the read is
// exchange's and the write is both. The entry keeps one id across the two,
// which is what lets the backfill and verify:parity compare them row for row -
// so the insert into exchange returns its id and payments.ledger is given the
// same one rather than generating its own.
//
// The mirror is inside the caller's transaction. addTransactionLog is called
// from features/sales-orders during checkout, already inside one, and the
// executor is threaded through so the ledger entry commits or rolls back with
// the order it belongs to. A ledger that disagrees with the orders it explains
// is worse than no ledger.
import query from "#shared/db/query.js";
import * as exchange from "#features/transactions/repo.exchange.js";

export const addFunds = exchange.addFunds;
export const removeFunds = exchange.removeFunds;
export const getTransactionHistory = exchange.getTransactionHistory;

export async function addTransactionLog(
  user_id,
  transaction_type,
  purchase_order_id,
  sales_order_id,
  amount,
  client
) {
  const inserted = await query(
    `INSERT INTO exchange.account_transactions
       (user_id, transaction_type, purchase_order_id, sales_order_id, amount)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, occurred_at, created_at, updated_at`,
    [user_id, transaction_type, purchase_order_id, sales_order_id, amount],
    client
  );

  const row = inserted.rows[0];

  // The order reference is only carried when the order is itself in the new
  // schema; the foreign key would refuse it otherwise, and refusing a ledger
  // entry is worse than one missing its context. Same rule as the backfill.
  await query(
    `INSERT INTO payments.ledger (id, user_id, type, order_id, amount,
                                  occurred_at, created_at, updated_at)
     SELECT $1, $2, $3,
            (SELECT o.id FROM orders.orders o WHERE o.id = $4),
            $5, $6, $7, $8
     ON CONFLICT (id) DO NOTHING`,
    [
      row.id,
      user_id,
      transaction_type,
      purchase_order_id ?? sales_order_id ?? null,
      amount,
      row.occurred_at,
      row.created_at,
      row.updated_at,
    ],
    client
  );

  return inserted;
}
