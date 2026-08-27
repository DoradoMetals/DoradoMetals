import { requiredEnv } from "#shared/env/required.ts";
// Everything this codebase asks Stripe to do.
//
// The same shape providers/shipments has: the feature says what it wants and the
// provider knows the API. Before this, features/payments called
// stripeClient.paymentIntents.create() directly in ten places across a service
// and a controller, which meant the payments domain and the Stripe SDK were the
// same code - exactly the confusion that moving the client here was meant to
// end, and only half-ended.
//
// What that buys, beyond tidiness: every call to Stripe is now in one file, so
// the set of things we depend on Stripe for is readable at a glance, and a
// second processor or a test double has one surface to satisfy instead of ten
// call sites to find.
//
// Deliberately thin. No mapping, no defaults, no business rules - those belong
// to features/payments. This is the boundary, not a layer.
import stripeClient from "#providers/payment/stripe-client.ts";

export function retrieveIntent(paymentIntentId: string) {
  return stripeClient.paymentIntents.retrieve(paymentIntentId);
}

export function createIntent({
  amount,
  currency = "usd",
  customerId,
}: {
  amount: number;
  currency?: string;
  customerId?: string;
}) {
  return stripeClient.paymentIntents.create({
    amount,
    currency,
    customer: customerId,
    capture_method: "automatic",
    automatic_payment_methods: { enabled: true },
  });
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
