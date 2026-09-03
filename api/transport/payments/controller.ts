// HTTP in, HTTP out. Every body is parsed against the contract's own schema in
// STRICT mode - except the webhook, whose body is raw bytes Stripe signs and
// this file verifies before reading a field off it.
import { UpdatePaymentIntentBody, CancelPaymentIntentBody } from "@dorado/contracts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { oneString } from "#shared/http/query.ts";
import { parseStrict, uuidLike } from "#shared/http/validate.ts";
import * as stripe from "#providers/payment/stripe.ts";
import * as stripeService from "#domain/payments/service.ts";
import { logger } from "#shared/logging/logger.ts";

export const handleStripeWebhook = asyncHandler(async (req, res) => {
  // A HEADER CAN BE AN ARRAY AND CAN BE ABSENT, and this signature check is the
  // one thing standing between this endpoint and anybody who can guess its URL.
  const sig = req.headers["stripe-signature"];
  if (typeof sig !== "string") {
    return res.status(400).send("Webhook Error: missing stripe-signature");
  }

  let event;

  try {
    event = stripe.verifyWebhook(req.body, sig);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "Stripe webhook signature verification failed"
    );
    return res
      .status(400)
      .send(`Webhook Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      await stripeService.updateIntentFromWebhook({
        paymentIntent: event.data.object,
      });
      // NULL IS THE CASE THAT MATTERS: an intent can succeed without a payment
      // method, and looking up null would throw after the intent update had
      // already run - a 500 on an update Stripe would then retry.
      const methodId = event.data.object.payment_method;
      if (typeof methodId === "string") {
        const paymentMethod = await stripe.retrievePaymentMethod(methodId);
        await stripeService.updateMethod({ paymentMethod });
      }
      break;
    }

    case "payment_intent.processing": {
      await stripeService.updateIntentFromWebhook({
        paymentIntent: event.data.object,
      });
      // NULL IS THE CASE THAT MATTERS: an intent can succeed without a payment
      // method, and looking up null would throw after the intent update had
      // already run - a 500 on an update Stripe would then retry.
      const methodId = event.data.object.payment_method;
      if (typeof methodId === "string") {
        const paymentMethod = await stripe.retrievePaymentMethod(methodId);
        await stripeService.updateMethod({ paymentMethod });
      }
      break;
    }

    case "payment_intent.payment_failed": {
      await stripeService.updateIntentFromWebhook({
        paymentIntent: event.data.object,
      });

      break;
    }

    case "payment_intent.created": {
      await stripeService.updateIntentFromWebhook({
        paymentIntent: event.data.object,
      });
      break;
    }

    case "payment_intent.canceled": {
      await stripeService.updateIntentFromWebhook({
        paymentIntent: event.data.object,
      });
      break;
    }

    case "payment_intent.amount_capturable_updated": {
      await stripeService.updateIntentFromWebhook({
        paymentIntent: event.data.object,
      });
      break;
    }

    // THE FIVE charge.* EVENTS CARRY A CHARGE, NOT AN INTENT. A charge's id is
    // `ch_...` and the update keys on the attempt's provider_ref, so each of
    // these matched no row. Keying on `charge.payment_intent` is the obvious
    // repair and the wrong one: a charge has no settled amount, so it would
    // write NULL over one. Explicit until a statement that reads a charge
    // exists.
    case "charge.failed":
    case "charge.updated":
    case "charge.captured":
    case "charge.pending":
    case "charge.succeeded": {
      logger.debug(`${event.type} carries a charge, not an intent - ignored`);
      break;
    }

    case "customer.created": {
      break;
    }

    case "payment_method.updated": {
      await stripeService.updateMethod({ paymentMethod: event.data.object });
      break;
    }

    default:
      logger.debug(`Unhandled Stripe event type: ${event.type}`);
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
    oneString(req.query.type),
    oneString(req.query.user_id),
    req.headers
  );
  res.json(paymentIntent.client_secret);
});

export const updatePaymentIntent = asyncHandler(async (req, res) => {
  const body = parseStrict(
    UpdatePaymentIntentBody, req.body, "stripe/update_payment_intent body"
  );
  const paymentIntent = await stripeService.updatePaymentIntent(body, req.headers);
  res.json(paymentIntent.client_secret);
});

export const getPaymentIntentFromSalesOrderId = asyncHandler(async (req, res) => {
  // Express types every query value as string | string[] | ParsedQs, so an id
  // can arrive as an array and reach a uuid comparison as one.
  const sales_order_id = parseStrict(uuidLike, req.query.sales_order_id, "sales_order_id");
  const paymentIntent = await stripeService.getPaymentIntentFromSalesOrderId({ sales_order_id });
  res.json(paymentIntent);
});

export const cancelPaymentIntent = asyncHandler(async (req, res) => {
  const body = parseStrict(
    CancelPaymentIntentBody, req.body, "stripe/cancel_payment_intent body"
  );
  const paymentIntent = await stripeService.cancelPaymentIntent(body);
  res.json(paymentIntent);
});
