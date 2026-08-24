import { z } from "zod/v4";

// exchange keeps one row per Stripe intent with everything inline; the new
// schema separates what was asked for from what was tried from the instrument.
// Both repos return the nested shape, and features/payments/wire.js flattens it
// back for the frontend behind PAYMENTS_WIRE.
//
// ONE ENDPOINT returns a repo row: GET /stripe/get_sales_order_payment_intent.
// The other three answer with Stripe's client_secret or Stripe's own object, so
// there is nothing of ours on the wire to describe.

// An attempt is what was tried, and it is the only thing carrying a reference
// issued by a provider - a second processor would issue its own.
export const PaymentAttemptWire = z.object({
  provider: z.string().nullable(),
  provider_ref: z.string().nullable(),
  status: z.string().nullable(),
});
export type PaymentAttemptWire = z.infer<typeof PaymentAttemptWire>;

// The instrument. `type` is the new schema's vocabulary - CARD, ACH - rather
// than Stripe's card / us_bank_account, which is what the legacy wire carries;
// the adapter maps between them.
//
// There is no `routing`, and that is deliberate rather than an omission. It is a
// customer's bank routing number. It reached the wire only because the exchange
// read was SELECT *, it is null on every row in dev and in production, and
// nothing in the frontend reads it.
export const PaymentDetailsWire = z.object({
  provider: z.string().nullable(),
  provider_ref: z.string().nullable(),
  type: z.string().nullable(),
  last_four: z.string().nullable(),
  card_brand: z.string().nullable(),
  bank_name: z.string().nullable(),
  account_type: z.string().nullable(),
});
export type PaymentDetailsWire = z.infer<typeof PaymentDetailsWire>;

const money = z.union([z.number(), z.string()]).nullable();

export const PaymentIntentWireNext = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid().nullable(),
  user_id: z.string().uuid().nullable(),
  type: z.string().nullable(),
  status: z.string().nullable(),
  // orders.orders is one table with a direction, so there is one order id here
  // where exchange had two columns. The direction is what lets the adapter put
  // it back in the one it came out of.
  order_id: z.string().uuid().nullable(),
  direction: z.enum(["purchase", "sale"]).nullable(),
  // DOLLARS. exchange stores cents because it was written from Stripe's objects;
  // the new schema stores dollars like everything else in it, and the adapter
  // multiplies by 100 on the way down.
  amount_expected: money,
  amount_received: money,
  amount_capturable: money,
  created_at: z.string(),
  updated_at: z.string(),
  attempt: PaymentAttemptWire,
  details: PaymentDetailsWire.nullable(),
});
export type PaymentIntentWireNext = z.infer<typeof PaymentIntentWireNext>;

// What the frontend reads today: frontend/features/stripe/types.ts, and
// AdminPending.tsx destructuring payment_status, payment_intent_id, card_brand,
// bank_name, bank_account_type and last_four off one flat object. CENTS.
export const PaymentIntentWire = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid().nullable(),
  user_id: z.string().uuid().nullable(),
  type: z.string().nullable(),
  payment_status: z.string().nullable(),
  payment_intent_id: z.string().nullable(),
  sales_order_id: z.string().uuid().nullable(),
  purchase_order_id: z.string().uuid().nullable(),
  amount: money,
  amount_received: money,
  amount_capturable: money,
  method_id: z.string().nullable(),
  method_type: z.string().nullable(),
  last_four: z.string().nullable(),
  card_brand: z.string().nullable(),
  bank_name: z.string().nullable(),
  bank_account_type: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type PaymentIntentWire = z.infer<typeof PaymentIntentWire>;
