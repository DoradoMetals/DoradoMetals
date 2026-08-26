import * as stripe from "#providers/stripe/stripe.js";
import * as stripeRepo from "#features/payments/repo.js";
import * as productService from "#features/products/service.ts";
import * as addressService from "#features/addresses/service.ts";
import * as taxService from "#features/sales-tax/service.js";
import * as spotsService from "#features/spots/service.js";
import { calculateSalesOrderTotal } from "#features/sales-orders/utils/calculations.ts";

import { auth } from "#features/auth/client.js";
import { fromNodeHeaders } from "better-auth/node";

export async function retrievePaymentIntent(type, user_id, headers) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(headers),
  });

  // The repos return the new shape on both sides now, so the provider's id for
  // the intent is on the attempt: an intent is what was asked for and an attempt
  // is what was tried, and only the attempt has a reference from a provider.
  const vals = await stripeRepo.retrievePaymentIntent(type, session, user_id);
  if (vals?.attempt?.provider_ref) {
    return await stripe.retrieveIntent(vals.attempt.provider_ref);
  } else {
    return await createPaymentIntent(type, user_id, session);
  }
}

export async function createPaymentIntent(type, user_id, session) {
  let customerId = session?.user?.stripeCustomerId;

  if (!customerId) {
    const { id } = await stripe.createCustomer({
      name: session.user?.name,
      email: session.user?.email,
    });
    customerId = id;
    await stripeRepo.attachCustomerToUser(customerId, session?.user?.id);
  }

  const existing = await stripeRepo.retrievePaymentIntent(
    type,
    session,
    user_id
  );
  if (existing?.attempt?.provider_ref) {
    return await stripe.retrieveIntent(existing.attempt.provider_ref);
  }

  // The placeholder amount is the feature's decision, not Stripe's: an intent is
  // opened before the cart is priced and updated when it is.
  const paymentIntent = await stripe.createIntent({ amount: 1000, customerId });

  await stripeRepo.createPaymentIntent(paymentIntent, type, user_id, session);
  return paymentIntent;
}

export async function updatePaymentIntent(
  {
    items,
    using_funds,
    // `spots` is deliberately NOT accepted. The frontend still sends it; it is
    // ignored rather than overwritten, so nothing here can read it by accident.
    shipping_service,
    payment_method,
    user,
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
    session,
    user?.id
  );

  const address = await addressService.getAddressFromId(address_id);
  const server_items = await productService.getItemsFromServer(items);

  // THE CHARGE AMOUNT IS PRICED FROM THE SERVER'S SPOTS, NOT THE CALLER'S.
  //
  // This is the one that reached money. `spots` arrived in the request body,
  // fed calculateSalesOrderTotal, and the result became `amount` on the Stripe
  // intent a few lines below. Measured before the fix, identical order and
  // identical server-fetched items, only the body's spots differing:
  //
  //   ask_spot 3400 (honest)  ->  $3,673.53  ->  Stripe told 367353
  //   ask_spot 1              ->     $26.81  ->  Stripe told 2681
  //
  // The floor of Math.max(rawAmount, 1000) meant the bottom was $10.00.
  //
  // Fetched fresh on every update rather than cached, which is what makes an
  // intent that is revised mid-checkout carry the current price rather than the
  // one from whenever the session started.
  const spots = await spotsService.getPricingSpots();

  const items_with_tax = await taxService.attachSalesTaxToItems(
    address?.state ?? "TX",
    server_items,
    spots
  );

  const orderPrices = calculateSalesOrderTotal(
    items_with_tax,
    using_funds,
    spots,
    type === "admin" ? user : session.user,
    shipping_service,
    payment_method
  );

  const rawAmount = Math.round(orderPrices.post_charges_amount * 100);

  const amount = Math.max(rawAmount, 1000);
  if (
    retrieved_intent?.attempt?.provider_ref &&
    [
      "requires_payment_method",
      "requires_confirmation",
      "requires_action",
    ].includes(retrieved_intent?.status)
  ) {
    const paymentIntent = await stripe.updateIntent(
      retrieved_intent.attempt.provider_ref,
      { amount }
    );

    await stripeRepo.updatePaymentIntent(paymentIntent);

    return paymentIntent;
  } else {
    return await createPaymentIntent(type, user?.id, session);
  }
}

export async function capturePaymentIntent(payment_intent_id) {
  try {
    const paymentIntent = await stripe.captureIntent(payment_intent_id);
    return paymentIntent;
  } catch (err) {
    throw err;
  }
}

export async function cancelPaymentIntent({ payment_intent_id }) {
  try {
    const paymentIntent = await stripe.cancelIntent(payment_intent_id);
    return paymentIntent;
  } catch (err) {
    throw err;
  }
}

export async function updateMethod({ paymentMethod }) {
  await stripeRepo.updateMethod({ paymentMethod });
}

export async function updateIntentFromWebhook({ paymentIntent }) {
  await stripeRepo.updatePaymentIntent(paymentIntent);
}

export async function getPaymentIntentFromSalesOrderId({ sales_order_id }) {
  return await stripeRepo.getPaymentIntentFromSalesOrderId(sales_order_id);
}
