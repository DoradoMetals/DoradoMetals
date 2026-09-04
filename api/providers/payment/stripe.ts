import { requiredEnv } from "#shared/env/required.ts";
// Everything this codebase asks Stripe to do — the same shape as providers/shipments: the feature says what it wants, the provider knows the API. Before this, features/payments called the Stripe SDK directly in ten places, mixing the payments domain with the SDK itself.
// Deliberately thin — no mapping, no defaults, no business rules (those belong to features/payments); this is the boundary, not a layer.
import stripeClient from "#providers/payment/stripe-client.ts";
import type Stripe from "stripe";

// THIRD-PARTY SHAPES LIVE HERE, NOT IN CONTRACTS. @dorado/contracts describes
// our own columns; these describe what Stripe hands back, so this adapter is
// their one home rather than a domain file re-declaring them (ruling 60/61's
// "one home" applies to a provider's shapes as much as a table's).

// The fields this application reads off a Stripe PaymentIntent - deliberately
// not Stripe's whole type, which would be a claim about a shape we do not
// own. `amount` is in CENTS. THIS IS THE ONLY SHAPE: domain/payments/service.ts
// used to carry a second, near-identical local for what its use cases hand
// back, and the two are merged into this one.
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

// THE SEAM domain/payments/webhook.ts's applyIntentEvent takes for "what does
// Stripe say this instrument is" - place.ts takes its World the same way. A
// webhook payload names an instrument by REFERENCE ONLY, so something has to
// ask Stripe what it is; this is what a test supplies instead, with no
// network and no cassette.
export type Instruments = {
  retrieve: (payment_method_ref: string) => Promise<StripePaymentMethodLike>;
};

export function retrieveIntent(paymentIntentId: string) {
  return stripeClient.paymentIntents.retrieve(paymentIntentId);
}

export function createIntent({
  amount,
  currency = "usd",
  customerId,
  metadata,
  idempotencyKey,
}: {
  amount: number;
  currency?: string;
  customerId?: string;
  /** Lands on the intent in Stripe's dashboard and exports - the reconciliation
   *  fields a webhook payload otherwise never carries (D25). */
  metadata?: Record<string, string>;
  /** Same key + same params = same intent, so a network retry cannot mint a
   *  second one. Scope it to what makes two calls "the same attempt". */
  idempotencyKey?: string;
}) {
  return stripeClient.paymentIntents.create(
    {
      amount,
      currency,
      customer: customerId,
      capture_method: "automatic",
      automatic_payment_methods: { enabled: true },
      metadata,
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );
}

export function updateIntent(paymentIntentId: string, changes: Record<string, unknown>) {
  return stripeClient.paymentIntents.update(paymentIntentId, changes);
}

export function captureIntent(paymentIntentId: string) {
  return stripeClient.paymentIntents.capture(paymentIntentId);
}

// "No such payment_intent" and "already canceled" are STATES Stripe reports as
// SDK errors, not faults - translated here, at the boundary, so the domain
// never inspects an error message. Anything else propagates.
export async function cancelIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  try {
    return await stripeClient.paymentIntents.cancel(paymentIntentId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/No such payment_intent|already.*cancel/i.test(msg)) {
      return { id: paymentIntentId, status: "canceled" } as Stripe.PaymentIntent;
    }
    throw err;
  }
}

export function createCustomer({
  name,
  email,
}: {
  name?: string | null;
  email?: string | null;
}) {
  return stripeClient.customers.create({ name: name ?? "", email: email ?? "" });
}

export function retrievePaymentMethod(paymentMethodId: string) {
  return stripeClient.paymentMethods.retrieve(paymentMethodId);
}

// The webhook signature check. It is Stripe's business what a valid signature
// looks like, and the secret is Stripe's too, so it lives here rather than in a
// controller.
export function verifyWebhook(rawBody: Buffer | string, signature: string) {
  return stripeClient.webhooks.constructEvent(
    rawBody,
    signature,
    requiredEnv("STRIPE_WEBHOOK_SECRET")
  );
}
