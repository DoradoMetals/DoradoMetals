// Payments read from the exchange schema, which currently serves traffic.
//
// Projected explicitly rather than SELECT *, and composed into the same nested
// shape repo.next returns, so the two implementations agree whatever the switch
// says. That is the pattern carriers and addresses follow: the internal shape is
// the new one on both sides, and features/payments/wire.js flattens it back for
// the frontend behind PAYMENTS_WIRE.
//
// exchange keeps the intent, the attempt and the instrument in one row. The
// separation is real - an intent can be attempted more than once, and the same
// card can pay for several - so the shape says so and this builds it out of the
// flat row.
//
// MONEY UNITS. exchange stores CENTS, because that is Stripe's unit and this
// table was written straight from Stripe's objects. The new schema stores
// DOLLARS like everything else in it. The nested shape is the new schema's, so
// every amount here is divided by 100 on the way out and the adapter multiplies
// it back for the legacy wire. Getting that backwards is a hundredfold error and
// it is asserted in both directions.
//
// `routing` is deliberately NOT returned. It is a customer's bank routing
// number, it is null on every row in dev and in production, and nothing in the
// frontend reads it - the field existed only because this read was SELECT *.
// CLAUDE.md: never log or return bank details.
import query from "#shared/db/query.js";

// The shape both implementations return. The amounts are numeric columns, so
// the division is exact rather than integer division.
const FIELDS = `
    id,
    session_id,
    user_id,
    type,
    payment_status                    AS status,
    coalesce(sales_order_id, purchase_order_id) AS order_id,
    -- Which of exchange's two order columns held it. orders.orders is one table
    -- with a direction, so the new shape has one order_id - and without this the
    -- adapter could not put it back in the right column on the way down.
    -- Production has 2 intents against a sales order and none against a purchase
    -- order, so this is exercised on one side only; the other is still the
    -- difference between correct and lucky.
    CASE WHEN sales_order_id IS NOT NULL THEN 'sale'
         WHEN purchase_order_id IS NOT NULL THEN 'purchase' END AS direction,
    (amount::numeric / 100)           AS amount_expected,
    (amount_received::numeric / 100)  AS amount_received,
    (amount_capturable::numeric / 100) AS amount_capturable,
    created_at,
    updated_at,
    jsonb_build_object(
      'provider',     'stripe',
      'provider_ref', payment_intent_id,
      'status',       payment_status
    ) AS attempt,
    CASE WHEN method_id IS NULL THEN NULL ELSE jsonb_build_object(
      'provider',     'stripe',
      'provider_ref', method_id,
      -- Normalised to the new schema's vocabulary rather than Stripe's, by the
      -- same mapping repo.next's updateMethod writes - otherwise the two
      -- implementations would disagree here and diff would report it. The
      -- adapter maps it back to Stripe's spelling for the legacy wire.
      -- dev holds card and us_bank_account; production holds card and null.
      'type',         CASE method_type
                        WHEN 'us_bank_account' THEN 'ACH'
                        WHEN 'card' THEN 'CARD'
                        ELSE upper(method_type)
                      END,
      'last_four',    last_four,
      'card_brand',   card_brand,
      'bank_name',    bank_name,
      'account_type', bank_account_type
    ) END AS details
`;

// Takes an executor like every other function here. Without one this read runs
// on the pool, so it cannot see an intent created earlier in the caller's
// transaction - and reusing an intent is exactly the decision that wants a
// consistent view of what has just been written.
export async function retrievePaymentIntent(type, session, user_id, executor) {
  const sql = `
    SELECT ${FIELDS}
    FROM exchange.payment_intents
    WHERE session_id = $1
    AND user_id = $2
    AND type = $3
    AND payment_status != 'succeeded'
    AND payment_status != 'processing'
    AND payment_status != 'canceled'
  `;
  const values = [
    session.session.id,
    type === 'admin' ? user_id : session.user.id,
    type,
  ];
  const { rows } = await query(sql, values, executor);
  return rows[0];
}

export async function createPaymentIntent(payment_intent, type, user_id, session, executor) {
  const sql = `
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
  const values = [
    session.session.id,
    type === 'admin' ? user_id : session.user.id,
    type,
    payment_intent.status,
    payment_intent.id,
  ];
  await query(sql, values, executor);
}

export async function updatePaymentIntent(payment_intent, executor) {
  const sql = `
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
  await query(sql, values, executor);
}

export async function updateMethod({ paymentMethod }, executor) {
  const sql = `
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
  await query(sql, values, executor);
}

export async function attachOrder(
  payment_intent_id,
  purchase_order_id,
  sales_order_id,
  client
) {
  const sql = `
    UPDATE exchange.payment_intents
    SET sales_order_id = $1, purchase_order_id = $2
    WHERE payment_intent_id = $3
  `;
  const values = [sales_order_id, purchase_order_id, payment_intent_id];
  await query(sql, values, client);
}

export async function attachCustomerToUser(customerId, userId, executor) {
  const sql = `
    UPDATE exchange.users
    SET "stripeCustomerId" = $1
    WHERE id = $2
  `;
  const values = [customerId, userId];
  await query(sql, values, executor);
}

export async function getPaymentIntentFromSalesOrderId(sales_order_id, executor) {
  const sql = `
    SELECT ${FIELDS}
    FROM exchange.payment_intents
    WHERE sales_order_id = $1
  `;
  const values = [sales_order_id];
  const result = await query(sql, values, executor);
  return result.rows[0];
}
