const pool = require("../db");

async function retrievePaymentIntent(type, session) {
  const query = `
    SELECT *
    FROM exchange.payment_intents
    WHERE session_id = $1
    AND user_id = $2
    AND type = $3
    AND payment_status != 'succeeded'
    AND payment_status != 'processing'
    AND payment_status != 'canceled'
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
    payment_status,
    payment_intent_id
  )
  VALUES (
    $1, $2, $3, $4, $5
  )
  `;
  const values = [session.session.id, session.user.id, type, payment_intent.status, payment_intent.id];
  await pool.query(query, values);
}

async function updatePaymentIntent(payment_intent) {
  const query = `
    UPDATE exchange.payment_intents
    SET payment_status = $1,
        updated_at = NOW(),
        amount = $2,
        amount_received = $3,
        amount_capturable = $4,
        method_id = $5
    WHERE payment_intent_id = $6
  `;
  const values = [
    payment_intent.status,
    payment_intent.amount,
    payment_intent.amount_received,
    payment_intent.amount_capturable,
    payment_intent.payment_method,
    payment_intent.id,
  ];
  await pool.query(query, values);
}

async function updateMethod({ paymentMethod }) {
  const query = `
    UPDATE exchange.payment_intents
    SET method_type = $1,
        routing = $2,
        last_four = $3,
        card_brand = $4,
        bank_name = $5,
        bank_account_type = $6
    WHERE method_id = $7
  `;
  const values = [
    paymentMethod.type,
    paymentMethod?.us_bank_account?.routing_number,
    paymentMethod?.us_bank_account?.last4 ?? paymentMethod?.card?.last4,
    paymentMethod?.card?.brand,
    paymentMethod?.us_bank_account?.bank_name,
    paymentMethod?.us_bank_account?.account_type,
    paymentMethod?.id,
  ];
  await pool.query(query, values);
}

async function attachOrder(
  payment_intent_id,
  purchase_order_id,
  sales_order_id,
  client
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
  `;
  const values = [customerId, userId];

  await pool.query(query, values);
}

async function getPaymentIntentFromSalesOrderId(sales_order_id) {
  const query = `
  SELECT *
  FROM exchange.payment_intents
  WHERE sales_order_id = $1
  `;
  const values = [sales_order_id];
  const result = await pool.query(query, values);
  return result.rows[0];
}

module.exports = {
  retrievePaymentIntent,
  createPaymentIntent,
  updatePaymentIntent,
  updateMethod,
  attachOrder,
  attachCustomerToUser,
  getPaymentIntentFromSalesOrderId,
};
