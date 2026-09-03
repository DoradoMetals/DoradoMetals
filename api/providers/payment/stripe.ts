import { requiredEnv } from "#shared/env/required.ts";
// Everything this codebase asks Stripe to do — the same shape as providers/shipments: the feature says what it wants, the provider knows the API. Before this, features/payments called the Stripe SDK directly in ten places, mixing the payments domain with the SDK itself.
// Deliberately thin — no mapping, no defaults, no business rules (those belong to features/payments); this is the boundary, not a layer.
import stripeClient from "#providers/payment/stripe-client.ts";

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

export function cancelIntent(paymentIntentId: string) {
  return stripeClient.paymentIntents.cancel(paymentIntentId);
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
