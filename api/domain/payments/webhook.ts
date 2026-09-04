// WHAT STRIPE TELLS US AFTER THE FACT, applied to the rows that record it.
//
// This is a USE CASE and it lives here rather than in the controller, which
// used to hold `applyIntentEvent` - two service calls and a `typeof x ===
// "string"` guard, which is a decision about what a webhook means and belongs
// with the other decisions about what a webhook means. The transport verifies
// Stripe's signature, reads `event.type`, and calls one of these.
//
// LOAD -> WRITE (one transaction) -> AFTER. The intent update is the durable
// half and runs first; the instrument is recorded after it, so a failure to
// identify an instrument cannot cost us the record that money moved.
import {
  orders as ordersRepo, paymentDetails as details, paymentMethods as methods,
} from "#db";
import * as stripe from "#providers/payment/stripe.ts";
import {
  assertWebhookMatched, instrumentValues, methodTypeFor,
} from "#domain/payments/rules.ts";
import { findIntentByRef, updateFromProvider } from "#domain/payments/service.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import { randomUUID } from "node:crypto";
// StripeIntentLike, StripePaymentMethodLike and Instruments are the
// provider's shapes - #providers/payment/stripe.ts is their one home (ruling
// 60/61); `Instruments` is the seam this file's own applyIntentEvent takes,
// the way place.ts takes its `World`, and it lives beside the Stripe shape it
// wraps rather than being declared here a second time.
import type { StripeIntentLike, StripePaymentMethodLike, Instruments } from "#providers/payment/stripe.ts";

export const LIVE: Instruments = { retrieve: stripe.retrievePaymentMethod };

// AN INTENT EVENT. D24, decided by Jacob 26 August: A WEBHOOK THAT MATCHES NO
// ROW IS REFUSED, so Stripe retries it. It used to be accepted silently while
// nothing here was written, which is the shape of the missing $126.48.
//
// It does NOT create the missing row (D25): an intent needs session_id,
// user_id and type, none of which a webhook payload carries.
export async function applyIntentEvent(
  paymentIntent: StripeIntentLike,
  payment_method_ref?: unknown,
  world: Instruments = LIVE
): Promise<void> {
  // The SETTLEMENT TRANSITION is detected from the payment fact itself: what
  // the stored intent said before this webhook. A retry arrives with the row
  // already succeeded and changes no label, which is what lets the label write
  // below be pure, unguarded flair (D211). It is also who the intent belongs
  // to, which is how an instrument gets attributed further down.
  const prior = await findIntentByRef(paymentIntent.id);
  assertWebhookMatched(
    paymentIntent.id,
    await withTransaction((tx) => updateFromProvider(paymentIntent, tx))
  );

  // THE WEBHOOK FINISHES THE ORDER'S LABEL, AND ONLY ITS LABEL (D211).
  // Paidness itself is the intent row just written. A succeeded intent with no
  // order attached is not an error: that is the customer who paid and never
  // completed creation, and reconcile:payments owns the sweep.
  if (
    paymentIntent.status === "succeeded" &&
    prior?.payment_status !== "succeeded" &&
    prior?.direction === "sale" &&
    prior?.order_id
  ) {
    await withTransaction((tx) => ordersRepo.update(prior.order_id!, { status: "Preparing" }, {}, tx));
  }

  // NULL IS THE CASE THAT MATTERS - an intent can succeed without a payment
  // method, and looking up null would throw after the intent update had
  // already run: a 500 on work Stripe would then retry forever.
  if (typeof payment_method_ref !== "string") return;
  await recordInstrument(await world.retrieve(payment_method_ref), prior?.user_id ?? null);
}

// A `payment_method.updated` event: the instrument changed, and no intent is
// involved, so there is nobody to attribute a first sighting to.
export async function applyMethodEvent(
  paymentMethod: StripePaymentMethodLike | null | undefined
): Promise<void> {
  await recordInstrument(paymentMethod, null);
}

// The instrument Stripe says was used, recorded against the method row that
// names it. Found by the provider's id for it - 077 gave payments.details the
// (provider, provider_ref) key.
//
// *** IT USED TO THROW ON A FIRST SIGHTING, AND THAT WAS A LIVE DEFECT. ***
// `payments.details.user_id` is NOT NULL and a webhook payload names no
// customer, so an instrument nothing had recorded raised Invalid - AFTER the
// intent update had committed. Stripe sees a non-2xx, retries for up to three
// days, and every retry re-throws at the same line while changing nothing.
//
// The payload names no customer, but the INTENT does: the attempt this event
// carries resolves to an intent row whose user_id is who paid. That is the
// attribution, taken from the money rather than guessed. Without one - a
// `payment_method.updated` for an instrument we never recorded - there is
// nothing to write and nothing to say, so it returns.
async function recordInstrument(
  paymentMethod: StripePaymentMethodLike | null | undefined,
  user_id: string | null
): Promise<void> {
  const type = methodTypeFor(paymentMethod?.type);
  const method = type ? await methods.findByType("sale", type) : undefined;
  const values = instrumentValues(paymentMethod, method?.id ?? null);
  if (!values.provider_ref) return;

  const existing = await details.findByProviderRef("stripe", values.provider_ref);
  if (existing) {
    await withTransaction((tx) => details.update(existing.id, values, tx));
    return;
  }
  if (!user_id) return;
  await withTransaction((tx) => details.create(randomUUID(), user_id, values, tx));
}
