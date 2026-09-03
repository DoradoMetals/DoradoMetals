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
// Since 2026-08-27 it is also the wire: the frontend reads status, attempt and
// details from @dorado/contracts, and the adapter that flattened them back to
// payment_status and payment_intent_id is deleted.
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
import query from "#shared/db/query.ts";
import type { PaymentIntent } from "@dorado/contracts";
import type { PoolClient } from "pg";

// Repos take an optional executor so a caller can pull them into its
// transaction; without one they run on the pool.
type Executor = PoolClient | undefined;

// The row BOTH implementations return, taken from the wire contract rather than
// rebuilt by hand - validate:wire already parses real rows through it for
// exchange and next alike, so it is the one description of this shape that has
// been checked against the database.
//
// The two timestamps are the exception. A contract describes the WIRE, where a
// timestamp is a string because JSON made it one; pg hands back a Date. Taking
// the contract unchanged would have quietly typed a Date as a string, and
// `created_at.getTime()` would then be a type error in code that works.
export type PaymentIntentRow = Omit<
  PaymentIntent,
  "created_at" | "updated_at"
> & {
  created_at: Date;
  updated_at: Date;
};

// The fields these functions read off a Stripe PaymentIntent. Deliberately not
// the whole Stripe type: this is what the code touches, and amount is in CENTS
// on the way in - see the header.
export type StripeIntentLike = {
  id: string;
  status?: string | null;
  amount?: number | null;
  amount_received?: number | null;
};

// better-auth's session, as this repo uses it.
export type SessionLike = {
  session: { id: string };
  user: { id: string };
};

// The fields read off a Stripe PaymentMethod. Every one is optional because
// which are present depends on the instrument.
export type StripePaymentMethodLike = {
  id?: string;
  type?: string;
  card?: { last4?: string | null; brand?: string | null } | null;
  us_bank_account?: {
    bank_name?: string | null;
    account_type?: string | null;
    last4?: string | null;
  } | null;
};

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

// The VERBATIM facts for one Stripe intent id - what createSalesOrder verifies
// before it will attach an intent to an order (phase 9). Raw status, both
// order links split back out by the order's direction, and the amount in
// CENTS, because the caller compares it against Math.round(dollars * 100) -
// the shape exchange.payment_intents carried, kept so the money comparison
// stays integer-exact.
export type VerbatimIntent = {
  payment_intent_id: string;
  user_id: string | null;
  session_id: string | null;
  type: string | null;
  payment_status: string | null;
  amount: number | null;
  sales_order_id: string | null;
  purchase_order_id: string | null;
};

export async function getVerbatimByIntentId(
  payment_intent_id: string,
  executor?: Executor
): Promise<VerbatimIntent | undefined> {
  const { rows } = await query<VerbatimIntent>(
    `SELECT a.provider_ref AS payment_intent_id,
            i.user_id, i.session_id, i.type,
            i.status AS payment_status,
            round(i.amount_expected * 100) AS amount,
            CASE WHEN o.direction = 'sale' THEN i.order_id END AS sales_order_id,
            CASE WHEN o.direction = 'purchase' THEN i.order_id END AS purchase_order_id
       FROM payments.intents i
       JOIN payments.attempts a ON a.intent_id = i.id
       LEFT JOIN orders.orders o ON o.id = i.order_id
      WHERE a.provider_ref = $1
      ORDER BY i.created_at DESC, i.id
      LIMIT 1`,
    [payment_intent_id],
    executor
  );
  return rows[0];
}

// An intent is reusable while it has not resolved. Keyed on the trio 075 added:
// without session_id, user_id and type this question cannot be asked here at
// all, which is what forced that migration.
export async function retrievePaymentIntent(
  type: string | undefined,
  session: SessionLike,
  // Read only when type is "admin" - the customer the intent is opened FOR.
  user_id: string | null | undefined,
  executor?: Executor
): Promise<PaymentIntentRow | undefined> {
  const { rows } = await query<PaymentIntentRow>(
    `SELECT ${FIELDS} ${FROM}
      WHERE i.session_id = $1
        AND i.user_id = $2
        AND i.type = $3
        AND i.status NOT IN ('succeeded', 'processing', 'canceled')
      ORDER BY i.created_at DESC, i.id
      LIMIT 1`,
    [session.session.id, type === "admin" ? user_id : session.user.id, type ?? null],
    executor
  );
  return rows[0];
}

export async function getPaymentIntentFromSalesOrderId(
  sales_order_id: string,
  executor?: Executor
): Promise<PaymentIntentRow | undefined> {
  const { rows } = await query<PaymentIntentRow>(
    `SELECT ${FIELDS} ${FROM} WHERE i.order_id = $1 ORDER BY i.created_at DESC, i.id LIMIT 1`,
    [sales_order_id],
    executor
  );
  return rows[0];
}

// An intent and the attempt that carries its provider reference are created
// together: exchange has no notion of an attempt, so one intent means one
// attempt until something tells us otherwise.
export async function createPaymentIntent(
  payment_intent: StripeIntentLike,
  type: string | undefined,
  // Read only when type is "admin" - the customer the intent is opened FOR.
  user_id: string | null | undefined,
  session: SessionLike,
  executor?: Executor
): Promise<void> {
  const { rows } = await query<{ id: string }>(
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

// Answers whether the webhook matched an intent. See the exchange
// implementation and D24: a webhook that matches nothing must not be accepted.
export async function updatePaymentIntent(
  payment_intent: StripeIntentLike,
  executor?: Executor
): Promise<boolean> {
  const { rows } = await query<{ id: string }>(
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
  if (!rows[0]) return false;

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
  if ((payment_intent.amount_received ?? 0) > 0) {
    await query(
      `INSERT INTO payments.settlements (id, attempt_id, settled_amount, provider, provider_ref)
       VALUES ($1, $1, $2, 'stripe', $3)
       ON CONFLICT (id) DO UPDATE SET settled_amount = EXCLUDED.settled_amount`,
      [rows[0].id, (payment_intent.amount_received as number) / 100, payment_intent.id],
      executor
    );
  }
  return true;
}

// The instrument Stripe says was used. It is found by the provider's id for it,
// which is what 077 gave payments.details - exchange keyed this on a column
// called method_id that holds a pm_... string, not a foreign key.
export async function updateMethod(
  { paymentMethod }: { paymentMethod?: StripePaymentMethodLike | null },
  executor?: Executor
): Promise<void> {
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
export async function attachOrder(
  payment_intent_id: string,
  purchase_order_id: string | null | undefined,
  sales_order_id: string | null | undefined,
  client?: Executor
): Promise<void> {
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
// lives post-cutover. 107's identity mirror carries this write back into
// exchange.users; the dual layer writes both explicitly anyway.
export async function attachCustomerToUser(
  customerId: string,
  userId: string,
  executor?: Executor
): Promise<void> {
  await query(
    `UPDATE auth.users SET "stripeCustomerId" = $1 WHERE id = $2`,
    [customerId, userId],
    executor
  );
}

/** The customer an admin-opened intent bills: name, email, and any existing
 *  Stripe customer id. Payments-owned rather than widening the users wire. */
export async function billingIdentityFor(user_id: string, executor?: PoolClient) {
  const { rows } = await query<{
    id: string; name: string | null; email: string | null; stripeCustomerId: string | null;
  }>(
    `SELECT id, name, email, "stripeCustomerId" FROM auth.users WHERE id = $1`,
    [user_id],
    executor
  );
  return rows[0];
}
