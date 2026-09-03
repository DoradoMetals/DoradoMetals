import { requiredParam } from "#shared/http/caller.ts";
import { oneString } from "#shared/http/query.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as stripe from "#providers/payment/stripe.ts"
import * as stripeService from "#domain/payments/service.ts"
import { logger } from "#shared/logging/logger.ts";

export const handleStripeWebhook = asyncHandler(async (req, res) => {
  // A HEADER CAN BE AN ARRAY, AND CAN BE ABSENT.
  //
  // Node types req.headers[x] as `string | string[] | undefined`, and it means
  // it - a client may send the same header twice. Either non-string form went
  // straight into Stripe's signature check, which is the one thing standing
  // between this endpoint and anybody who can guess its URL. It refuses them,
  // so this was never a hole; refusing here makes the reason legible instead of
  // arriving as whatever Stripe's error happens to say.
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
      // payment_method is `string | PaymentMethod | null` on Stripe's own type.
      // Null is the case that matters: an intent can succeed without one on
      // some flows, and retrievePaymentMethod(null) would throw INSIDE the
      // handler - after updateIntentFromWebhook had already run - so the
      // response would be a 500 and Stripe would retry an update that had
      // already been applied. Nothing to look up is not an error; it just means
      // there is no instrument to record.
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
      // payment_method is `string | PaymentMethod | null` on Stripe's own type.
      // Null is the case that matters: an intent can succeed without one on
      // some flows, and retrievePaymentMethod(null) would throw INSIDE the
      // handler - after updateIntentFromWebhook had already run - so the
      // response would be a 500 and Stripe would retry an update that had
      // already been applied. Nothing to look up is not an error; it just means
      // there is no instrument to record.
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

    // THE FIVE charge.* EVENTS CARRY A CHARGE, NOT A PAYMENT INTENT, AND HAVE
    // NEVER UPDATED ANYTHING.
    //
    // Each passed `event.data.object` to updateIntentFromWebhook, which ends at
    // `UPDATE exchange.payment_intents ... WHERE payment_intent_id = $6` keyed
    // on that object's `id`. A charge's id is `ch_...`, so the statement has
    // matched no row for every charge event this application has ever received.
    //
    // Keying on `charge.payment_intent` instead is the obvious repair and it is
    // the wrong one: a charge has no `amount_received` and no
    // `amount_capturable`, so the same statement would write NULL over a
    // settled amount. Recording a charge needs a statement that reads a charge -
    // a schema question, and where payments.settlements comes in - not a
    // one-line fix. Explicit until then, rather than accidental.
    //
    // Three of these also lacked a `break` and fell through to the next case,
    // so charge.pending ran the same no-op twice.
    //
    // features/payments/webhook-updates.test.js asserts the no-op, so a repair
    // has something to change.
    case "charge.failed":
    case "charge.updated":
    case "charge.captured":
    case "charge.pending":
    case "charge.succeeded": {
      logger.debug(
        `${event.type} carries a charge, which exchange.payment_intents cannot be updated from - ignored`
      );
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

// TYPE=ADMIN IS A PRIVILEGE, NOT A PARAMETER.
//
// The repos read `type === "admin" ? user_id : session.user.id`, so `type`
// decided whose intent was fetched - and this route is requireUser. A signed-in
// customer could pass type=admin with somebody else's user_id and get their
// payment intent back, and the response is the Stripe object's client_secret,
// which is what confirms a payment from a browser.
//
// The type still selects the flow, because an admin placing an order on a
// customer's behalf is a real thing. It just cannot be claimed by asking.
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
  const paymentIntent = await stripeService.updatePaymentIntent(
    req.body,
    req.headers
  );
  res.json(paymentIntent.client_secret);
});

export const getPaymentIntentFromSalesOrderId = asyncHandler(async (req, res) => {
  // The whole query object was passed to a service declaring
  // `{ sales_order_id: string }`. Express types every value in it as
  // string | string[] | ParsedQs, so the id could arrive as an array or an
  // object and reach a uuid comparison as one.
  const paymentIntent = await stripeService.getPaymentIntentFromSalesOrderId({
    sales_order_id: requiredParam(req.query.sales_order_id, "sales_order_id"),
  });
  res.json(paymentIntent);
});

export const cancelPaymentIntent = asyncHandler(async (req, res) => {
  const paymentIntent = await stripeService.cancelPaymentIntent(req.body);
  res.json(paymentIntent);
});
