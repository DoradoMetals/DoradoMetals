const pool = require("../db");

async function retrievePaymentIntent(type, session) {
  const query = `
    SELECT *
    FROM exchange.payment_intents
    WHERE session_id = $1
    AND user_id = $2
    AND type = $3
    AND payment_status != 'succeeded'
  `;
  const values = [session.session.id, session.user.id, type];
  const { rows } = await pool.query(query, values);
  return rows[0];
}

async function createPaymentIntent(payment_intent, type, session) {
  const query = `
  INSERT INTO exchange.payment_intents (
    session_id,
    user_id,
    type,
    payment_intent_id
  )
  VALUES (
    $1, $2, $3, $4
  )
  `;
  const values = [session.session.id, session.user.id, type, payment_intent.id];
  await pool.query(query, values);
}

async function updatePaymentIntent(payment_intent) {
  const query = `
    UPDATE exchange.payment_intents
    SET payment_status = $1, updated_at = NOW()
    WHERE payment_intent_id = $2
  `;
  const values = [payment_intent.status, payment_intent.id];
  await pool.query(query, values);
}

async function updateStatus({ paymentIntent }) {
  const query = `
    UPDATE exchange.payment_intents
    SET payment_status = $1, method = $2
    WHERE payment_intent_id = $3
  `;
  const values = [
    paymentIntent.status,
    paymentIntent.payment_method,
    paymentIntent.id,
  ];
  await pool.query(query, values);
}

async function attachOrder(
  payment_intent_id,
  purchase_order_id,
  sales_order_id,
  client,
) {
  const query = `
    UPDATE exchange.payment_intents
    SET sales_order_id = $1, purchase_order_id = $2
    WHERE payment_intent_id = $3
  `;
  const values = [sales_order_id, purchase_order_id, payment_intent_id];
  await client.query(query, values);
}

async function attachCustomerToUser(customerId, userId) {
  const query = `
  UPDATE exchange.users
    SET "stripeCustomerId" = $1
  WHERE id = $2
  `
  const values = [customerId, userId]

  await pool.query(query, values)
}

module.exports = {
  retrievePaymentIntent,
  createPaymentIntent,
  updatePaymentIntent,
  updateStatus,
  attachOrder,
  attachCustomerToUser,
};
