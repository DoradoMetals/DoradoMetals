// HTTP in, HTTP out. Every body is parsed against the contract's own schema in
// STRICT mode - except the webhook, whose body is raw bytes Stripe signs and
// this file verifies before reading a field off it.
import { CancelPaymentIntentBody, UpdatePaymentIntentBody } from "@dorado/contracts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { oneString } from "#shared/http/query.ts";
import { parseStrict, uuidLike } from "#shared/http/validate.ts";
import { refuseWith } from "#shared/http/refuse.ts";
import * as stripe from "#providers/payment/stripe.ts";
import * as stripeService from "#domain/payments/service.ts";
import * as webhook from "#domain/payments/webhook.ts";
import type { Request } from "express";
import type { PaymentCaller } from "@dorado/contracts";

// WHO IS ASKING, as the two ids an intent is keyed on. requireUser has already
// run and set both; this is the one place that says so instead of a `!` in
// every handler.
function callerOf(req: Request): PaymentCaller {
  const user_id = req.user?.id;
  const session_id = req.sessionId;
  if (!user_id || !session_id) {
    return refuseWith(401, "no session - this endpoint needs a signed-in caller");
  }
  return { session_id, user_id };
}

// SIGNATURE, EVENT TYPE, ONE USE CASE. What an event MEANS - which of them can
// name an instrument, what a first sighting of one is worth, who it belongs to
// - is domain/payments/webhook.ts. This file only says which door it goes
// through; `applyIntentEvent` used to live here, and deciding what a webhook
// means is not a transport's job.
export const handleStripeWebhook = asyncHandler(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  if (typeof sig !== "string") {
    return refuseWith(400, "missing stripe-signature header");
  }

  const event = stripe.verifyWebhook(req.body, sig);

  switch (event.type) {
    // The two that can name the instrument the money moved on.
    case "payment_intent.succeeded":
    case "payment_intent.processing":
      await webhook.applyIntentEvent(event.data.object, event.data.object.payment_method);
      break;

    case "payment_intent.payment_failed":
    case "payment_intent.created":
    case "payment_intent.canceled":
    case "payment_intent.amount_capturable_updated":
      await webhook.applyIntentEvent(event.data.object);
      break;

    // charge.* carries a charge id, not an intent - ignored.
    case "charge.failed":
    case "charge.updated":
    case "charge.captured":
    case "charge.pending":
    case "charge.succeeded":
    case "customer.created":
      break;

    case "payment_method.updated":
      await webhook.applyMethodEvent(event.data.object);
      break;

    default:
      break;
  }

  res.json({ received: true });
});

// TYPE=ADMIN IS A PRIVILEGE, NOT A PARAMETER. `type` decides WHOSE intent is
// fetched, and the response carries the client_secret a browser confirms a
// payment with - so a signed-in customer passing type=admin with somebody
// else's user_id would have received their payment credential.
export const retrievePaymentIntent = asyncHandler(async (req, res) => {
  if (req.query.type === "admin" && req.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const paymentIntent = await stripeService.retrievePaymentIntent(
    callerOf(req), oneString(req.query.type), oneString(req.query.user_id)
  );
  res.json(paymentIntent.client_secret);
});

export const updatePaymentIntent = asyncHandler(async (req, res) => {
  if (req.body?.type === "admin" && req.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const body = parseStrict(
    UpdatePaymentIntentBody, req.body, "stripe/update_payment_intent body"
  );
  const paymentIntent = await stripeService.updatePaymentIntent(callerOf(req), body);
  res.json(paymentIntent.client_secret);
});

export const getPaymentIntentFromSalesOrderId = asyncHandler(async (req, res) => {
  const order_id = parseStrict(uuidLike, req.query.order_id, "order_id");
  res.json(await stripeService.getPaymentIntentFromSalesOrderId(order_id));
});

export const cancelPaymentIntent = asyncHandler(async (req, res) => {
  const { payment_intent_id } = parseStrict(
    CancelPaymentIntentBody, req.body, "stripe/cancel_payment_intent body"
  );
  res.json(await stripeService.cancelPaymentIntent(payment_intent_id));
});
