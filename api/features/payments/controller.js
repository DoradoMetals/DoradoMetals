import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as stripe from "#providers/stripe/stripe.js"
import * as stripeService from "#features/payments/service.ts"

export const handleStripeWebhook = asyncHandler(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.verifyWebhook(req.body, sig);
  } catch (err) {
    console.error(
      "❌ Stripe webhook signature verification failed:",
      err.message
    );
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      await stripeService.updateIntentFromWebhook({
        paymentIntent: event.data.object,
      });
      const paymentMethod = await stripe.retrievePaymentMethod(
        event.data.object.payment_method
      );

      await stripeService.updateMethod({ paymentMethod: paymentMethod });
      break;
    }

    case "payment_intent.processing": {
      await stripeService.updateIntentFromWebhook({
        paymentIntent: event.data.object,
      });
      const paymentMethod = await stripe.retrievePaymentMethod(
        event.data.object.payment_method
      );

      await stripeService.updateMethod({ paymentMethod: paymentMethod });
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
      console.log(
        `ℹ️  ${event.type} carries a charge, which exchange.payment_intents cannot be updated from - ignored`
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
      console.log(`ℹ️  Unhandled Stripe event type: ${event.type}`);
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
    req.query.type,
    req.query.user_id,
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
  const paymentIntent = await stripeService.getPaymentIntentFromSalesOrderId(
    req.query
  );
  res.json(paymentIntent);
});

export const cancelPaymentIntent = asyncHandler(async (req, res) => {
  const paymentIntent = await stripeService.cancelPaymentIntent(req.body);
  res.json(paymentIntent);
});
