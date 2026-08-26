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

    case "charge.failed": {
      await stripeService.updateIntentFromWebhook({
        paymentIntent: event.data.object,
      });
      break;
    }

    case "charge.updated": {
      await stripeService.updateIntentFromWebhook({
        paymentIntent: event.data.object,
      });
      break;
    }

    case "charge.captured": {
      await stripeService.updateIntentFromWebhook({
        paymentIntent: event.data.object,
      });
      break;
    }

    case "charge.pending": {
      await stripeService.updateIntentFromWebhook({
        paymentIntent: event.data.object,
      });
    }

    case "charge.succeeded": {
      await stripeService.updateIntentFromWebhook({
        paymentIntent: event.data.object,
      });
    }

    case "customer.created": {
      break;
    }

    case "payment_method.updated": {
      await stripeService.updateMethod({ paymentMethod: event.data.object });
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
