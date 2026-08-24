// Everything this codebase asks Stripe to do.
//
// The same shape providers/fedex has: the feature says what it wants and the
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
import stripeClient from "#providers/stripe/client.js";

export function retrieveIntent(paymentIntentId) {
  return stripeClient.paymentIntents.retrieve(paymentIntentId);
}

export function createIntent({ amount, currency = "usd", customerId }) {
  return stripeClient.paymentIntents.create({
    amount,
    currency,
    customer: customerId,
    capture_method: "automatic",
    automatic_payment_methods: { enabled: true },
  });
}

export function updateIntent(paymentIntentId, changes) {
  return stripeClient.paymentIntents.update(paymentIntentId, changes);
}

export function captureIntent(paymentIntentId) {
  return stripeClient.paymentIntents.capture(paymentIntentId);
}

export function cancelIntent(paymentIntentId) {
  return stripeClient.paymentIntents.cancel(paymentIntentId);
}

export function createCustomer({ name, email }) {
  return stripeClient.customers.create({ name: name ?? "", email: email ?? "" });
}

export function retrievePaymentMethod(paymentMethodId) {
  return stripeClient.paymentMethods.retrieve(paymentMethodId);
}

// The webhook signature check. It is Stripe's business what a valid signature
// looks like, and the secret is Stripe's too, so it lives here rather than in a
// controller.
export function verifyWebhook(rawBody, signature) {
  return stripeClient.webhooks.constructEvent(
    rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}
