// Payments read from the payments schema.
//
// exchange keeps one row per Stripe intent with everything inline; the new
// schema separates what was asked for from what was tried and what settled:
// payments.intents, payments.attempts, payments.settlements. The Stripe intent
// id lives on the attempt as provider_ref, because it is a reference issued by a
// provider and a second processor would issue its own.
//
// This returns the new shape, and repo.exchange composes the same one out of its
// flat row, so the internal shape does not depend on which switch is selected.
// features/payments/wire.ts flattens it back for the frontend behind
// PAYMENTS_WIRE - the frontend reads payment_status and payment_intent_id today
// and stops when it is migrated, not before.
//
// The split was landed projecting the exchange names first, deliberately, so
// `diff` could compare the two implementations without a reshape in the way.
// This is the second step: nothing could have told a migration bug from a
// reshaping bug if they had happened together.
//
// MONEY UNITS. exchange.payment_intents.amount is in CENTS; payments.intents
// .amount_expected is in DOLLARS, because everything else in the new schema is.
// The new shape is the new schema's, so this needs no conversion and every WRITE
// still divides, because a write arrives from Stripe in cents. Getting this
// backwards is a hundredfold error, so it is written out rather than implied.
import query from "#shared/db/query.js";

// amount_received comes off the settlement rather than the intent, because that
// is the whole point of settlements: an intent records what was asked for and a
// settlement records what actually moved. exchange keeps both on the one row.
//
// amount_capturable has no column here and is null. It is a Stripe field about
// an authorisation that has not been captured, nothing reads it, and inventing a
// column to hold a number the provider already knows would be storing a copy of
// somebody else's state.
const FIELDS = `
      i.id,
      i.session_id,
      i.user_id,
      i.type,
      i.status,
      i.order_id,
      o.direction,
      i.amount_expected,
      st.settled_amount AS amount_received,
      NULL::numeric     AS amount_capturable,
      i.created_at,
      i.updated_at,
      jsonb_build_object(
        'provider',     a.provider,
        'provider_ref', a.provider_ref,
        'status',       a.status
      ) AS attempt,
      CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object(
        'provider',     d.provider,
        'provider_ref', d.provider_ref,
        'type',         pm.type,
        'last_four',    d.last_four,
        'card_brand',   d.card_brand,
        'bank_name',    d.bank_name,
        'account_type', d.account_type
      ) END AS details`;

const FROM = `
    FROM payments.intents i
    LEFT JOIN payments.attempts    a  ON a.intent_id = i.id
    LEFT JOIN payments.settlements st ON st.attempt_id = a.id
    LEFT JOIN payments.details     d  ON d.id = i.details_id
    LEFT JOIN payments.methods     pm ON pm.id = d.method_id
    LEFT JOIN orders.orders        o  ON o.id = i.order_id`;

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
