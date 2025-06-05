const { stripeClient } = require("../stripe");
const stripeService = require("../services/stripeService");

async function handleStripeWebhook(req, res) {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripeClient.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(
      "❌ Stripe webhook signature verification failed:",
      err.message
    );
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object;
      console.log("✅  PaymentIntent succeeded:", paymentIntent.id);
      break;
    }

    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object;
      const failedMsg = paymentIntent.last_payment_error?.message || "Unknown";
      console.log(
        `❌  PaymentIntent failed (${paymentIntent.id}): ${failedMsg}`
      );
      break;
    }

    case "customer.created": {
      console.log("Created Customer");
    }

    default:
      console.log(`ℹ️  Unhandled Stripe event type: ${event.type}`);
  }

  res.json({ received: true });
}

async function retrievePaymentIntent(req, res, next) {
  try {
    const paymentIntent = await stripeService.retrievePaymentIntent(
      req.headers
    );
    res.json(paymentIntent.client_secret);
  } catch (err) {
    return next(err);
  }
}

async function updatePaymentIntent(req, res, next) {
  try {
    const paymentIntent = await stripeService.updatePaymentIntent(
      req.body,
      req.headers
    );
    res.json(paymentIntent.client_secret);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  handleStripeWebhook,
  retrievePaymentIntent,
  updatePaymentIntent,
};
