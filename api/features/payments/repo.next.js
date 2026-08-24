// Payments read from the payments schema.
//
// exchange keeps one row per Stripe intent with everything inline; the new
// schema separates what was asked for from what was tried and what settled:
// payments.intents, payments.attempts, payments.settlements. The Stripe intent
// id lives on the attempt as provider_ref, because it is a reference issued by a
// provider and a second processor would issue its own.
//
// This projects the exchange field names - payment_status, payment_intent_id -
// so the split is drop-in and diff can compare the two implementations. That is
// how every other feature started, and the inversion to the new names behind a
// PAYMENTS_WIRE adapter is the next step, not this one. Doing both at once would
// mean nothing could tell a migration bug from a reshaping bug.
//
// MONEY UNITS. exchange.payment_intents.amount is in CENTS; payments.intents
// .amount_expected is in DOLLARS, because everything else in the new schema is.
// Every read multiplies back and every write divides. Getting this backwards is
// a hundredfold error, so it is written out rather than implied.
import query from "#shared/db/query.js";

const FIELDS = `
      i.id,
      i.session_id,
      i.user_id,
      i.type,
      i.status              AS payment_status,
      a.provider_ref        AS payment_intent_id,
      i.order_id,
      (i.amount_expected * 100)::numeric AS amount,
      d.provider_ref        AS method_id,
      d.last_four,
      d.card_brand,
      d.bank_name,
      d.account_type        AS bank_account_type,
      i.created_at,
      i.updated_at`;

const FROM = `
    FROM payments.intents i
    LEFT JOIN payments.attempts a ON a.intent_id = i.id
    LEFT JOIN payments.details  d ON d.id = i.details_id`;

// An intent is reusable while it has not resolved. Keyed on the trio 075 added:
// without session_id, user_id and type this question cannot be asked here at
// all, which is what forced that migration.
export async function retrievePaymentIntent(type, session, user_id, executor) {
  const { rows } = await query(
    `SELECT ${FIELDS} ${FROM}
      WHERE i.session_id = $1
        AND i.user_id = $2
        AND i.type = $3
        AND i.status NOT IN ('succeeded', 'processing', 'canceled')
      ORDER BY i.created_at DESC, i.id
      LIMIT 1`,
    [session.session.id, type === "admin" ? user_id : session.user.id, type],
    executor
  );
  return rows[0];
}

export async function getPaymentIntentFromSalesOrderId(sales_order_id, executor) {
  const { rows } = await query(
    `SELECT ${FIELDS} ${FROM} WHERE i.order_id = $1 ORDER BY i.created_at DESC, i.id LIMIT 1`,
    [sales_order_id],
    executor
  );
  return rows[0];
}

// An intent and the attempt that carries its provider reference are created
// together: exchange has no notion of an attempt, so one intent means one
// attempt until something tells us otherwise.
export async function createPaymentIntent(payment_intent, type, user_id, session, executor) {
  const { rows } = await query(
    `INSERT INTO payments.intents (session_id, user_id, type, status, amount_expected)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      session.session.id,
      type === "admin" ? user_id : session.user.id,
      type,
      payment_intent.status,
      payment_intent.amount == null ? null : payment_intent.amount / 100,
    ],
    executor
  );

  await query(
    `INSERT INTO payments.attempts (id, intent_id, provider, provider_ref, amount, status)
     VALUES ($1, $1, 'stripe', $2, $3, $4)`,
    [
      rows[0].id,
      payment_intent.id,
      payment_intent.amount == null ? null : payment_intent.amount / 100,
      payment_intent.status,
    ],
    executor
  );
}

export async function updatePaymentIntent(payment_intent, executor) {
  const { rows } = await query(
    `UPDATE payments.intents i
        SET status = $1,
            amount_expected = $2,
            updated_at = now()
       FROM payments.attempts a
      WHERE a.intent_id = i.id AND a.provider_ref = $3
      RETURNING i.id`,
    [
      payment_intent.status,
      payment_intent.amount == null ? null : payment_intent.amount / 100,
      payment_intent.id,
    ],
    executor
  );
  if (!rows[0]) return;

  await query(
    `UPDATE payments.attempts
        SET status = $1, amount = $2
      WHERE intent_id = $3`,
    [
      payment_intent.status,
      payment_intent.amount == null ? null : payment_intent.amount / 100,
      rows[0].id,
    ],
    executor
  );

  // What actually settled. exchange keeps amount_received on the intent; here it
  // is a settlement, and only exists once money has moved.
  if (payment_intent.amount_received > 0) {
    await query(
      `INSERT INTO payments.settlements (id, attempt_id, settled_amount, provider, provider_ref)
       VALUES ($1, $1, $2, 'stripe', $3)
       ON CONFLICT (id) DO UPDATE SET settled_amount = EXCLUDED.settled_amount`,
      [rows[0].id, payment_intent.amount_received / 100, payment_intent.id],
      executor
    );
  }
}

// The instrument Stripe says was used. It is found by the provider's id for it,
// which is what 077 gave payments.details - exchange keyed this on a column
// called method_id that holds a pm_... string, not a foreign key.
export async function updateMethod({ paymentMethod }, executor) {
  await query(
    `INSERT INTO payments.details (
       id, method_id, bank_name, account_type, last_four, card_brand,
       provider, provider_ref
     )
     SELECT
       gen_random_uuid(), m.id, $1, $2, $3, $4, 'stripe', $5
     FROM (SELECT 1) _
     LEFT JOIN payments.methods m
       ON m.direction = 'sale'
      AND m.type = CASE $6::text
                     WHEN 'us_bank_account' THEN 'ACH'
                     WHEN 'card' THEN 'CARD'
                     ELSE upper($6::text)
                   END
     ON CONFLICT (provider, provider_ref) WHERE provider_ref IS NOT NULL
     DO UPDATE SET
       method_id    = EXCLUDED.method_id,
       bank_name    = EXCLUDED.bank_name,
       account_type = EXCLUDED.account_type,
       last_four    = EXCLUDED.last_four,
       card_brand   = EXCLUDED.card_brand,
       updated_at   = now()`,
    [
      paymentMethod?.us_bank_account?.bank_name,
      paymentMethod?.us_bank_account?.account_type,
      paymentMethod?.us_bank_account?.last4 ?? paymentMethod?.card?.last4,
      paymentMethod?.card?.brand,
      paymentMethod?.id,
      paymentMethod?.type,
    ],
    executor
  );

  // routing is deliberately not carried. It is null on every production row, and
  // if it were ever populated it would be a customer's bank routing number and
  // would want the same encryption treatment as exchange.payouts.
}

// exchange stores both order ids on the intent; orders.orders is one table with
// a direction, so whichever is given is the order.
export async function attachOrder(payment_intent_id, purchase_order_id, sales_order_id, client) {
  await query(
    `UPDATE payments.intents i
        SET order_id = (SELECT o.id FROM orders.orders o WHERE o.id = $1),
            updated_at = now()
       FROM payments.attempts a
      WHERE a.intent_id = i.id AND a.provider_ref = $2`,
    [sales_order_id ?? purchase_order_id, payment_intent_id],
    client
  );
}

// The Stripe customer id belongs to the user, and auth.users is where a user
// lives in the new schema. 056's trigger keeps it honest from the other side.
export async function attachCustomerToUser(customerId, userId, executor) {
  await query(
    `UPDATE auth.users SET "stripeCustomerId" = $1 WHERE id = $2`,
    [customerId, userId],
    executor
  );
}
