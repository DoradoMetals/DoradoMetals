// The customer credit ledger, against exchange.
//
// addFunds and removeFunds move exchange.users.dorado_funds, which is the
// balance itself, and they stay pointed at exchange in every variant: the users
// migration keeps auth.users honest with a trigger (056), so there is no second
// write for this feature to make.
//
// getTransactionHistory has an ORDER BY that the original did not. Without one
// a read returns rows in physical order, which is arbitrary, and this function
// returns rows[0] - so which row a caller got was undefined. Both
// implementations now order the same way, which is what makes the diff mean
// anything. It is not a wire change: nothing in the frontend calls this
// endpoint. See FOLLOWUPS for what else is wrong with it.
import query from "#shared/db/query.js";

export async function addFunds(user_id, total, client) {
  const sql = `
    UPDATE exchange.users
    SET dorado_funds = dorado_funds + $1
    WHERE id = $2
  `;
  const values = [total, user_id];
  return await query(sql, values, client);
}

export async function removeFunds(user_id, total, client) {
  const sql = `
    UPDATE exchange.users
    SET dorado_funds = dorado_funds - $1
    WHERE id = $2
  `;
  const values = [total, user_id];
  return await query(sql, values, client);
}

export async function getTransactionHistory(user_id) {
  const sql = `
    SELECT *
    FROM exchange.account_transactions
    WHERE user_id = $1
    ORDER BY occurred_at, id
  `;
  const values = [user_id];
  const result = await query(sql, values);
  return result.rows[0];
}

export async function addTransactionLog(
  user_id,
  transaction_type,
  purchase_order_id,
  sales_order_id,
  amount,
  client
) {
  const sql = `
    INSERT INTO exchange.account_transactions (user_id, transaction_type, purchase_order_id, sales_order_id, amount)
    VALUES ($1, $2, $3, $4, $5)
  `;
  const values = [
    user_id,
    transaction_type,
    purchase_order_id,
    sales_order_id,
    amount,
  ];
  return await query(sql, values, client);
}
