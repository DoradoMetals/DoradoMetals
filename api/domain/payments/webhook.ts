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
import type { StripeIntentLike, StripePaymentMethodLike, Instruments } from "#providers/payment/stripe.ts";

export const LIVE: Instruments = { retrieve: stripe.retrievePaymentMethod };

export async function applyIntentEvent(
  paymentIntent: StripeIntentLike,
  payment_method_ref?: unknown,
  world: Instruments = LIVE
): Promise<void> {
  const prior = await findIntentByRef(paymentIntent.id);
  assertWebhookMatched(
    paymentIntent.id,
    await withTransaction((tx) => updateFromProvider(paymentIntent, tx))
  );

  if (
    paymentIntent.status === "succeeded" &&
    prior?.payment_status !== "succeeded" &&
    prior?.direction === "sale" &&
    prior?.order_id
  ) {
    await withTransaction((tx) => ordersRepo.update(prior.order_id!, { status: "Preparing" }, {}, tx));
  }

  if (typeof payment_method_ref !== "string") return;
  await recordInstrument(await world.retrieve(payment_method_ref), prior?.user_id ?? null);
}

export async function applyMethodEvent(
  paymentMethod: StripePaymentMethodLike | null | undefined
): Promise<void> {
  await recordInstrument(paymentMethod, null);
}

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
