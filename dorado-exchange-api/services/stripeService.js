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
  let customerId = session?.user?.stripeCustomerId;

  if (!customerId) {
    const { id } = await stripeClient.customers.create({
      name: session.user?.name ?? "",
      email: session.user?.email ?? "",
    });
    customerId = id
  }

  const paymentIntent = await stripeClient.paymentIntents.create({
    amount: 50,
    currency: "usd",
    customer: customerId,
    automatic_payment_methods: { enabled: true },
  });

  await stripeRepo.attachCustomerToUser(customerId, session?.user?.id);
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

  const retrieved_intent = await stripeRepo.retrievePaymentIntent(
    type,
    session
  );
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

  if (
    retrieved_intent?.payment_intent_id ||
    !retrieved_intent?.status === "succeeded"
  ) {
    const paymentIntent = await stripeClient.paymentIntents.update(
      retrieved_intent.payment_intent_id,
      {
        amount: amount,
      }
    );
    await stripeRepo.updatePaymentIntent(paymentIntent);
    return paymentIntent;
  } else {
    return await createPaymentIntent(type, session);
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
