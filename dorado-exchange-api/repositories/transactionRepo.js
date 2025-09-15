import pool from '../db.js';

export async function addFunds(user_id, total, client) {
  const query = `
    UPDATE exchange.users
    SET dorado_funds = dorado_funds + $1
    WHERE id = $2
  `;
  const values = [total, user_id];
  return await client.query(query, values);
}

export async function removeFunds(user_id, total, client) {
  const query = `
    UPDATE exchange.users
    SET dorado_funds = dorado_funds - $1
    WHERE id = $2
  `;
  const values = [total, user_id];
  return await client.query(query, values);
}

export async function getTransactionHistory(user_id) {
  const query = `
    SELECT *
    FROM exchange.account_transactions
    WHERE user_id = $1
  `;
  const values = [user_id];
  const result = await pool.query(query, values);
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
  const query = `
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
  return await client.query(query, values);
}
