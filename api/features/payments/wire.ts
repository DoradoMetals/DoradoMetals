// exchange keeps one row per Stripe intent with everything inline. The new
// schema separates what was asked for (payments.intents) from what was tried
// (payments.attempts, which carries the provider's reference) from the
// instrument (payments.details), and both repos return that shape now.
//
// The frontend has not caught up: frontend/features/stripe/types.ts and
// AdminPending.tsx read payment_status, payment_intent_id, card_brand,
// bank_name, bank_account_type and last_four off one flat object.
//
//   PAYMENTS_WIRE=legacy  (default) flat, exchange's names
//   PAYMENTS_WIRE=next              status, attempt, details
//
// A transformation rather than a rename, so it does not use
// shared/wire/rename.ts, and unlike carriers/refiners/addresses it is not a
// lift either - shared/wire/lift.ts does not fit, and forcing it would hide the
// unit conversion below inside a declaration that looks like a rename.
//
// ONE ENDPOINT IS AFFECTED and it is worth being precise about which. Of the
// four payment routes, three answer with something that is not a repo row -
// retrieve and update send Stripe's client_secret, cancel sends Stripe's own
// object - so get_sales_order_payment_intent is the only response this converts.
// The rest of the reshape matters internally, to features/payments/service.js,
// which is why the repos changed shape rather than only the wire.
//
// MONEY UNITS, and this is the one that would be expensive to get wrong.
// exchange stores CENTS because it was written straight from Stripe's objects;
// the new schema stores DOLLARS like everything else in it. The internal shape
// is the new schema's, so flattening MULTIPLIES BY 100 and nesting divides.
// Both directions are asserted.
//
// `routing` is gone and does not come back. It is a customer's bank routing
// number, it was on the wire only because the read was SELECT *, it is null on
// every row in dev and production, and nothing in the frontend reads it.
// CLAUDE.md: never log or return bank details.
import type { WireRow, WireData } from "#shared/wire/rename.ts";

// The types are wide at the boundary for the reason rename.ts gives - this runs
// on whatever a handler is about to send, including objects that are not ours.
// What IS typed is the nested structure this file builds, because that is the
// part it owns and the part a PAYMENTS_WIRE flip exposes.

/** What payments.attempts contributes: what was tried, and the provider's ref. */
interface Attempt {
  provider: string;
  provider_ref: string | null;
  status: unknown;
}

/** What payments.details contributes: the instrument. Never carries `routing`. */
interface Details {
  provider: string;
  provider_ref: unknown;
  type: string | null;
  last_four: unknown;
  card_brand: unknown;
  bank_name: unknown;
  account_type: unknown;
}

type RowFn = (row: WireRow | null | undefined) => WireRow | null | undefined;

const overList =
  (fn: RowFn) =>
  (data: WireData): WireData =>
    Array.isArray(data) ? (data.map(fn) as WireRow[]) : (fn(data) as WireRow);

// Stripe's spelling of an instrument type, from the new schema's. The two
// values that exist are the two that map; anything else is lowercased, which is
// what Stripe's own vocabulary looks like.
const toStripeType = (type: unknown): string | null =>
  type == null
    ? null
    : type === "ACH"
      ? "us_bank_account"
      : type === "CARD"
        ? "card"
        : String(type).toLowerCase();

const fromStripeType = (type: unknown): string | null =>
  type == null
    ? null
    : type === "us_bank_account"
      ? "ACH"
      : type === "card"
        ? "CARD"
        : String(type).toUpperCase();

const cents = (dollarAmount: unknown): number | null =>
  dollarAmount == null ? null : Math.round(Number(dollarAmount) * 100);

const dollars = (c: unknown): number | null => (c == null ? null : Number(c) / 100);

// THE ONE HAZARD THE OTHER ADAPTERS DO NOT HAVE. Mounting this as middleware
// wraps res.json for the whole router, and one handler here answers with an
// object that is not ours: cancel_payment_intent sends Stripe's own
// PaymentIntent straight through. That object has a `status` and an `amount`,
// so a flatten written to recognise "an object" would rewrite Stripe's response
// into a half-null version of itself - a corruption, on the way out, with
// nothing failing.
//
// `attempt` is the discriminator. Both repos build it with jsonb_build_object
// unconditionally, so it is present on every row this feature produces and on
// nothing Stripe returns.
const isOurs = (row: unknown): row is WireRow =>
  row != null && typeof row === "object" && "attempt" in row;

function flatten(row: WireRow | null | undefined): WireRow | null | undefined {
  if (!isOurs(row)) return row;
  const { status, order_id, direction, attempt, details, amount_expected, ...rest } = row;
  const d = (details ?? {}) as Partial<Details>;
  const a = (attempt ?? {}) as Partial<Attempt>;
  return {
    ...rest,
    payment_status: status ?? null,
    payment_intent_id: a.provider_ref ?? null,
    // One order_id becomes the two columns exchange had, put back in whichever
    // one it came out of. A null direction means no order, and both stay null.
    sales_order_id: direction === "sale" ? (order_id ?? null) : null,
    purchase_order_id: direction === "purchase" ? (order_id ?? null) : null,
    amount: cents(amount_expected),
    amount_received: cents(rest.amount_received),
    amount_capturable: cents(rest.amount_capturable),
    method_id: d.provider_ref ?? null,
    method_type: toStripeType(d.type ?? null),
    last_four: d.last_four ?? null,
    card_brand: d.card_brand ?? null,
    bank_name: d.bank_name ?? null,
    bank_account_type: d.account_type ?? null,
  };
}

function nest(row: WireRow | null | undefined): WireRow | null | undefined {
  if (!row || typeof row !== "object") return row;
  if (row.attempt || row.status !== undefined) return row;
  const {
    payment_status,
    payment_intent_id,
    sales_order_id,
    purchase_order_id,
    amount,
    amount_received,
    amount_capturable,
    method_id,
    method_type,
    last_four,
    card_brand,
    bank_name,
    bank_account_type,
    ...rest
  } = row;

  // Nothing recognisable arrived, so nothing is invented. A request that is not
  // a payment intent passes through rather than growing an empty attempt.
  if (
    payment_status === undefined &&
    payment_intent_id === undefined &&
    method_id === undefined
  ) {
    return row;
  }

  const details: Details | null =
    method_id == null
      ? null
      : {
          provider: "stripe",
          provider_ref: method_id,
          type: fromStripeType(method_type ?? null),
          last_four: last_four ?? null,
          card_brand: card_brand ?? null,
          bank_name: bank_name ?? null,
          account_type: bank_account_type ?? null,
        };

  const attempt: Attempt = {
    provider: "stripe",
    provider_ref: (payment_intent_id ?? null) as string | null,
    status: payment_status ?? null,
  };

  return {
    ...rest,
    status: payment_status ?? null,
    order_id: sales_order_id ?? purchase_order_id ?? null,
    direction: sales_order_id ? "sale" : purchase_order_id ? "purchase" : null,
    amount_expected: dollars(amount),
    amount_received: dollars(amount_received),
    amount_capturable: dollars(amount_capturable),
    attempt,
    details,
  };
}

const identity: RowFn = (row) => row;
const SHAPES: Record<string, RowFn> = { legacy: flatten, next: identity };
const SHAPE = Object.hasOwn(SHAPES, process.env.PAYMENTS_WIRE ?? "")
  ? (process.env.PAYMENTS_WIRE as string)
  : "legacy";

export const activeShape = SHAPE;
export const toWire = overList(SHAPES[SHAPE]);
export const fromWire = overList(nest);
export const toLegacy = overList(flatten);
export const fromLegacy = overList(nest);
