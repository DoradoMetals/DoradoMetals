const { stripeClient } = require("../stripe");
const stripeRepo = require("../repositories/stripeRepo");

async function retrievePaymentIntent(headers) {
  const vals = await stripeRepo.retrievePaymentIntent(
    "sales_order_checkout",
    headers
  );
  if (vals?.payment_intent_id) {
    return await stripeClient.paymentIntents.retrieve(vals.payment_intent_id);
  } else {
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: 50,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
    });

    await stripeRepo.createPaymentIntent(
      paymentIntent,
      "sales_order_checkout",
      headers
    );
    return paymentIntent;
  }
}

async function updatePaymentIntent({ amount, type }, headers) {
  const vals = await stripeRepo.retrievePaymentIntent(type, headers);
  const amountInCents = Math.round(amount * 100);
  const paymentIntent = await stripeClient.paymentIntents.update(
    vals.payment_intent_id,
    {
      amount: amountInCents,
    }
  );
  await stripeRepo.updatePaymentIntent(paymentIntent);
  return paymentIntent;
}

module.exports = {
  retrievePaymentIntent,
  updatePaymentIntent,
};
