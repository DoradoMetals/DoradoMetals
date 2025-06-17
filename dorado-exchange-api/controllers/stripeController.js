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
      await stripeService.updateStatus({ paymentIntent: event.data.object });
      const paymentMethod = await stripeClient.paymentMethods.retrieve(
        event.data.object.payment_method
      );

      await stripeService.updateMethod({ paymentMethod: paymentMethod });
      break;
    }

    case "payment_intent.payment_failed": {
      await stripeService.updateStatus({ paymentIntent: event.data.object });

      break;
    }

    case "payment_intent.created": {
      await stripeService.updateStatus({ paymentIntent: event.data.object });
      break;
    }

    case "charge.failed": {
      await stripeService.updateStatus({ paymentIntent: event.data.object });
      break;
    }

    case "charge.updated": {
      await stripeService.updateStatus({ paymentIntent: event.data.object });
      break;
    }

    case "charge.succeeded": {
      await stripeService.updateStatus({ paymentIntent: event.data.object });
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
}

async function retrievePaymentIntent(req, res, next) {
  try {
    const paymentIntent = await stripeService.retrievePaymentIntent(
      req.query.type,
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
