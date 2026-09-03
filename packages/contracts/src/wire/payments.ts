import { z } from "zod/v4";
import { Direction } from "./direction.js";

// exchange keeps one row per Stripe intent with everything inline; the new
// schema separates what was asked for from what was tried from the instrument.
// Both repos return the nested shape, and since 2026-08-27 it is the wire:
// the frontend derives its own PaymentIntent from this one, and the adapter
// that flattened it back behind PAYMENTS_WIRE is deleted.
//
// ONE ENDPOINT returns a repo row: GET /stripe/get_sales_order_payment_intent.
// The other three answer with Stripe's client_secret or Stripe's own object, so
// there is nothing of ours on the wire to describe.

// An attempt is what was tried, and it is the only thing carrying a reference
// issued by a provider - a second processor would issue its own.
export const PaymentAttempt = z.object({
  provider: z.string().nullable(),
  provider_ref: z.string().nullable(),
  status: z.string().nullable(),
});
export type PaymentAttempt = z.infer<typeof PaymentAttempt>;

// The instrument. `type` is the new schema's vocabulary - CARD, ACH - rather
// than Stripe's card / us_bank_account, which is what the legacy wire carries;
// the adapter maps between them.
//
// There is no `routing`, and that is deliberate rather than an omission. It is a
// customer's bank routing number. It reached the wire only because the exchange
// read was SELECT *, it is null on every row in dev and in production, and
// nothing in the frontend reads it.
export const PaymentDetails = z.object({
  provider: z.string().nullable(),
  provider_ref: z.string().nullable(),
  type: z.string().nullable(),
  last_four: z.string().nullable(),
  card_brand: z.string().nullable(),
  bank_name: z.string().nullable(),
  account_type: z.string().nullable(),
});
export type PaymentDetails = z.infer<typeof PaymentDetails>;

const money = z.union([z.number(), z.string()]).nullable();

export const PaymentIntent = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid().nullable(),
  user_id: z.string().uuid().nullable(),
  type: z.string().nullable(),
  status: z.string().nullable(),
  // orders.orders is one table with a direction, so there is one order id here
  // where exchange had two columns. The direction is what lets the adapter put
  // it back in the one it came out of.
  order_id: z.string().uuid().nullable(),
  direction: Direction.nullable(),
  // DOLLARS. exchange stores cents because it was written from Stripe's objects;
  // the new schema stores dollars like everything else in it, and the adapter
  // multiplies by 100 on the way down.
  amount_expected: money,
  amount_received: money,
  amount_capturable: money,
  created_at: z.string(),
  updated_at: z.string(),
  attempt: PaymentAttempt,
  details: PaymentDetails.nullable(),
});
export type PaymentIntent = z.infer<typeof PaymentIntent>;

// The legacy PaymentIntentWire shape (one flat object - payment_status,
// payment_intent_id, the instrument inline, amounts in CENTS) lived here until
// 2026-08-27, describing what the frontend read. The frontend stopped:
// features/stripe/types.ts derives from this shape, AdminPending reads the
// nested one in dollars, and the adapter and its mount are gone. The
// -WireNext suffix retired 2026-08-28: one shape, one name.

// ===========================================================================
// THE REQUEST BODIES
// ===========================================================================
//
// Everything above describes what the API RETURNS; these two describe what it
// ACCEPTS, so the transport boundary can parse a body once, in strict mode,
// before the money path runs.

// THE PRICING UPDATE, AS IDS (D214 item 11, ruling 43). Every field the
// browser used to compose is a row the server already holds:
//
//   items[]            still the cart, but each line is an id and a quantity -
//                      a strict object, not a whole catalogue product.
//   user               GONE. It carried `dorado_funds`, so a request declared
//                      the credit balance it was priced against. The admin
//                      path names the CUSTOMER by id and the server reads
//                      their balance from auth.users.
//   spots              GONE. Declared-and-ignored kept a deployed client from
//                      being answered 400; on this branch no shape is
//                      preserved, and a price-shaped field the server refuses
//                      cannot be read by accident later.
//   shipping_service   -> carrier_service_id. The row's `code` prices delivery.
//   payment_method     -> payment_method_id. The row's `type` decides the card
//                      surcharge.
//   using_funds        GONE, and this is a BEHAVIOUR CHANGE: credit is applied
//                      whenever the customer has a balance, which is what
//                      placement already does (orders' OrderCreate). Leaving
//                      it here would price the intent differently from the
//                      order the intent pays for.
export const UpdatePaymentIntentBody = z.object({
  items: z.array(
    z.object({ id: z.string().uuid(), quantity: z.number() }).strict()
  ).default([]),
  address_id: z.string().uuid().optional(),
  carrier_service_id: z.string().uuid().optional(),
  payment_method_id: z.string().uuid().optional(),
  // ADMIN ONLY: whose order this prices. A customer's own intent is keyed by
  // their session, never by a body field.
  user_id: z.string().uuid().optional(),
  type: z.string().optional(),
}).strict();
export type UpdatePaymentIntentBody = z.infer<typeof UpdatePaymentIntentBody>;

export const CancelPaymentIntentBody = z.object({
  payment_intent_id: z.string(),
}).strict();
export type CancelPaymentIntentBody = z.infer<typeof CancelPaymentIntentBody>;
