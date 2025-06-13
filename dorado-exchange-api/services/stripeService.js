const { stripeClient } = require("../stripe");
const stripeRepo = require("../repositories/stripeRepo");
const salesOrderService = require("../services/salesOrderService");
const { calculateSalesOrderTotal } = require("../utils/price-calculations");

const { auth } = require("../auth");
const { fromNodeHeaders } = require("better-auth/node");

async function retrievePaymentIntent(type, headers) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(headers),
  });
  const vals = await stripeRepo.retrievePaymentIntent(type, session);
  if (vals?.payment_intent_id) {
    return await stripeClient.paymentIntents.retrieve(vals.payment_intent_id);
  } else {
    return await createPaymentIntent(type, session);
  }
}

async function createPaymentIntent(type, session) {
  const paymentIntent = await stripeClient.paymentIntents.create({
    amount: 50,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
  });

  await stripeRepo.createPaymentIntent(paymentIntent, type, session);
  return paymentIntent;
}

async function updatePaymentIntent(
  { items, using_funds, spots, shipping_service, payment_method, type },
  headers
) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(headers),
  });

  const vals = await stripeRepo.retrievePaymentIntent(type, session);
  const server_items = await salesOrderService.getItemsFromServer(items);

  const orderPrices = calculateSalesOrderTotal(
    server_items,
    using_funds,
    spots,
    session.user,
    shipping_service,
    payment_method
  );

  const amount = Math.round(orderPrices.post_charges_amount * 100);

  if (vals.payment_intent_id) {
    const paymentIntent = await stripeClient.paymentIntents.update(
      vals.payment_intent_id,
      {
        amount: amount,
      }
    );
    await stripeRepo.updatePaymentIntent(paymentIntent);
    return paymentIntent;
  }
}

async function updateStatus({ paymentIntent }) {
  await stripeRepo.updateStatus({ paymentIntent });
}

module.exports = {
  retrievePaymentIntent,
  updatePaymentIntent,
  updateStatus,
};
