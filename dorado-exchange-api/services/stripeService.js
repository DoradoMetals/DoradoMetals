const { stripeClient } = require("../stripe");
const stripeRepo = require("../repositories/stripeRepo");
const productService = require("../services/productService");
const addressService = require("../services/addressService");
const taxService = require("../services/taxService");
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
    customerId = id;
    await stripeRepo.attachCustomerToUser(customerId, session?.user?.id);
  }

  const existing = await stripeRepo.retrievePaymentIntent(type, session);
  if (existing?.payment_intent_id) {
    return await stripeClient.paymentIntents.retrieve(
      existing.payment_intent_id
    );
  }

  const paymentIntent = await stripeClient.paymentIntents.create({
    amount: 1000,
    currency: "usd",
    customer: customerId,
    capture_method: "automatic",
    automatic_payment_methods: { enabled: true },
  });

  await stripeRepo.createPaymentIntent(paymentIntent, type, session);
  return paymentIntent;
}

async function updatePaymentIntent(
  {
    items,
    using_funds,
    spots,
    shipping_service,
    payment_method,
    type,
    address_id,
  },
  headers
) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(headers),
  });

  const retrieved_intent = await stripeRepo.retrievePaymentIntent(
    type,
    session
  );

  const address = await addressService.getAddressFromId(address_id);
  const server_items = await productService.getItemsFromServer(items);
  const items_with_tax = await taxService.attachSalesTaxToItems(
    address?.state ?? "TX",
    server_items,
    spots
  );

  const orderPrices = calculateSalesOrderTotal(
    items_with_tax,
    using_funds,
    spots,
    session.user,
    shipping_service,
    payment_method
  );

  const amount = Math.round(orderPrices.post_charges_amount * 100);
  if (
    retrieved_intent?.payment_intent_id &&
    [
      "requires_payment_method",
      "requires_confirmation",
      "requires_action",
    ].includes(retrieved_intent?.payment_status)
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

async function capturePaymentIntent(payment_intent_id) {
  try {
    const paymentIntent = await stripeClient.paymentIntents.capture(
      payment_intent_id
    );
    return paymentIntent;
  } catch (err) {
    throw err;
  }
}

async function cancelPaymentIntent({payment_intent_id}) {
  try {
    const paymentIntent = await stripeClient.paymentIntents.cancel(
      payment_intent_id
    );
    return paymentIntent;
  } catch (err) {
    throw err;
  }
}

async function updateMethod({ paymentMethod }) {
  await stripeRepo.updateMethod({ paymentMethod });
}

async function updateIntentFromWebhook({ paymentIntent }) {
  await stripeRepo.updatePaymentIntent(paymentIntent);
}

async function getPaymentIntentFromSalesOrderId({ sales_order_id }) {
  return await stripeRepo.getPaymentIntentFromSalesOrderId(sales_order_id);
}
module.exports = {
  retrievePaymentIntent,
  updatePaymentIntent,
  capturePaymentIntent,
  cancelPaymentIntent,
  updateMethod,
  updateIntentFromWebhook,
  getPaymentIntentFromSalesOrderId,
};
