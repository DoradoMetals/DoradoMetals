// The payment DECISIONS, apart from the plumbing that carries them out.
//
// Everything here is pure: no database, no provider, no request. What it holds
// is the handful of facts that are easy to get wrong and expensive when they
// are - money units, whose intent an admin opens, and which provider states
// mean an intent is still live.
import { Forbidden, Invalid, NotFound } from "#shared/errors.ts";
import type { PaymentDetailsPatch, PaymentSurface } from "@dorado/contracts";

// The fields this application reads off a Stripe PaymentIntent. Deliberately
// not Stripe's whole type: a wider one would be a claim about a shape we do not
// own. `amount` is in CENTS.
//
// THIS IS THE ONLY SHAPE. service.ts carried a second, near-identical
// `StripeIntent` for what its use cases hand back - the same four fields plus
// `client_secret` - so the same object was described twice, one file apart.
// `client_secret` joins this one and the duplicate is gone.
export type StripeIntentLike = {
  id: string;
  status?: string | null;
  amount?: number | null;
  amount_received?: number | null;
  client_secret?: string | null;
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

// *** MONEY UNITS. *** Stripe speaks CENTS; every payments.* column is in
// DOLLARS, like the rest of the new schema. Getting this backwards is a
// hundredfold error, so the conversion has one home.
export function toDollars(cents: number | null | undefined): number | null {
  return cents == null ? null : cents / 100;
}

// *** WHOSE INTENT THIS IS. *** On the admin path the intent bills THE
// CUSTOMER - their Stripe customer object, their id in the metadata, their id
// in the idempotency key. Using the session's user throughout hung
// admin-opened intents off the ADMIN's Stripe customer and collided the
// idempotency key across every customer one admin served in a session, so the
// same key returned the first customer's intent for the second.
export function intentOwner(
  type: string | undefined | null,
  session_user_id: string,
  named_user_id: string | null | undefined
): string | null {
  return type === "admin" ? (named_user_id ?? null) : session_user_id;
}

// An intent Stripe can still be told a new amount for. Anything else has
// resolved, and the caller mints a fresh one.
const OPEN = new Set(["requires_payment_method", "requires_confirmation", "requires_action"]);

export function isOpen(status: string | null | undefined): boolean {
  return OPEN.has(status ?? "");
}

// Resolved: nothing more will be charged against it.
const RESOLVED = new Set(["canceled", "succeeded", "processing"]);

export function isResolved(status: string | null | undefined): boolean {
  return RESOLVED.has(status ?? "");
}

// Money has actually moved. Distinguishes a settled intent from a superseded
// one at order creation (D211).
export function isSettled(status: string | null | undefined): boolean {
  return status === "succeeded" || status === "processing";
}

// The schema's vocabulary for a Stripe instrument type. payments.methods calls
// them ACH and CARD; Stripe calls them us_bank_account and card.
export function methodTypeFor(stripe_type: string | null | undefined): string | null {
  if (!stripe_type) return null;
  if (stripe_type === "us_bank_account") return "ACH";
  if (stripe_type === "card") return "CARD";
  return stripe_type.toUpperCase();
}

// The instrument AS payments.details RECORDS IT - the repo's own write shape,
// so the caller passes this straight through instead of re-spelling it.
//
// ROUTING IS DELIBERATELY NOT CARRIED. It would be a customer's bank routing
// number, and it would want the same sealing the payout path uses.
export function instrumentValues(
  paymentMethod: StripePaymentMethodLike | null | undefined,
  method_id: string | null
): PaymentDetailsPatch {
  const bank = paymentMethod?.us_bank_account;
  const card = paymentMethod?.card;
  return {
    method_id,
    bank_name: bank?.bank_name ?? null,
    account_type: bank?.account_type ?? null,
    last_four: bank?.last4 ?? card?.last4 ?? null,
    card_brand: card?.brand ?? null,
    provider: "stripe",
    provider_ref: paymentMethod?.id ?? null,
  };
}

// STRIPE SPEAKS CENTS, and the two questions the update asks of an amount.
// `chargeCents` is the conversion; `isChargeable` is Stripe's own floor - below
// it there is nothing legal to update an intent TO.
const STRIPE_MINIMUM_CENTS = 50;

export function chargeCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function isChargeable(cents: number): boolean {
  return cents >= STRIPE_MINIMUM_CENTS;
}

// WHICH PAYMENT SURFACE THE CUSTOMER IS SHOWN, asked of the amount the card is
// actually told. The browser used to answer it with `beginning_funds <
// base_total`, one expression away from the two rules above; this is the same
// question put to the same numbers the charge is built from, so a quote and
// the intent that follows it cannot show one thing and charge another.
export function paymentSurface(post_charges_amount: number): PaymentSurface {
  return isChargeable(chargeCents(post_charges_amount)) ? "card" : "credit";
}

// THE REFUSALS. Ruling 65: a use case has no `throw` of its own - it asks one
// of these, on one line, and the refusal is stated once here where it can be
// read without the plumbing around it.

// WHOSE STRIPE CUSTOMER AN INTENT BILLS, refused when there is nobody to bill.
// The two kinds are different questions: on the customer path the SESSION has
// no user row, which is the caller's own standing (403); on the admin path the
// request NAMED somebody who is not there, which is the document (422).
export function assertBillingIdentity<T extends { id?: string | null }>(
  identity: T | null | undefined, type: string | undefined
): T {
  if (identity?.id) return identity;
  if (type === "admin") {
    throw new Invalid("an admin payment intent must name a customer that exists");
  }
  throw new Forbidden("no user row for this session");
}

// WHOSE ORDER AN UPDATE PRICES. Falling back to the session user on the admin
// path would price a customer's order against the ADMIN's credit balance and
// charge a number nobody can explain.
export function assertIntentSubject(subject: string | undefined): string {
  if (!subject) throw new Invalid("an admin payment intent must name the customer it is for");
  return subject;
}

// THE BALANCE IS THE SERVER'S FACT. `undefined` is a subject with no user row
// at all, which is not the same as a customer holding no credit - pricing that
// as zero would charge the full total to somebody the row says does not exist.
export function assertPriceableBalance(
  subject: string, balance: number | null | undefined
): number {
  if (balance === undefined) throw new NotFound(`no user ${subject} to price this intent for`);
  return Number(balance ?? 0);
}

// A WEBHOOK THAT MATCHES NO ROW IS REFUSED so Stripe retries it (D24). A plain
// Error on purpose: it is a fault rather than a refusal of the caller's - the
// caller is Stripe, and 500 is what makes it come back.
export function assertWebhookMatched(provider_ref: string, matched: boolean): void {
  if (!matched) {
    throw new Error(
      `stripe webhook: no payment intent row for ${provider_ref} - refusing so Stripe retries`
    );
  }
}
