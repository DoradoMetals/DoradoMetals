// Writes payments to both schemas, reads exchange.
//
// exchange stays authoritative while the switch is `dual`, so every read is
// exchange's and every write is both, inside one transaction.
//
// The ids differ between the two and cannot be made to match. exchange.payment_
// intents has its own id; payments.intents generates one and the attempt and any
// settlement share it. Nothing outside this feature refers to an intent by our
// id - every lookup is by the Stripe reference, the sales order, or the session
// trio - so the two schemas are matched on provider_ref rather than on id, and
// that is the one thing the mirror depends on staying true.
import withTransaction from "#shared/db/withTransaction.ts";
import * as exchange from "#features/payments/repo.exchange.js";
import * as next from "#features/payments/repo.next.ts";

const both = (executor, fn) => (executor ? fn(executor) : withTransaction(fn));

export const getVerbatimByIntentId = exchange.getVerbatimByIntentId;
export const billingIdentityFor = exchange.billingIdentityFor;
export const retrievePaymentIntent = exchange.retrievePaymentIntent;
export const getPaymentIntentFromSalesOrderId = exchange.getPaymentIntentFromSalesOrderId;

export const createPaymentIntent = (payment_intent, type, user_id, session, executor) =>
  both(executor, async (c) => {
    const r = await exchange.createPaymentIntent(payment_intent, type, user_id, session, c);
    await next.createPaymentIntent(payment_intent, type, user_id, session, c);
    return r;
  });

export const updatePaymentIntent = (payment_intent, executor) =>
  both(executor, async (c) => {
    const r = await exchange.updatePaymentIntent(payment_intent, c);
    await next.updatePaymentIntent(payment_intent, c);
    return r;
  });

export const updateMethod = ({ paymentMethod }, executor) =>
  both(executor, async (c) => {
    const r = await exchange.updateMethod({ paymentMethod }, c);
    await next.updateMethod({ paymentMethod }, c);
    return r;
  });

export const attachOrder = (payment_intent_id, purchase_order_id, sales_order_id, client) =>
  both(client, async (c) => {
    const r = await exchange.attachOrder(payment_intent_id, purchase_order_id, sales_order_id, c);
    await next.attachOrder(payment_intent_id, purchase_order_id, sales_order_id, c);
    return r;
  });

// BOTH TABLES, EXPLICITLY. This used to write exchange.users alone and cite
// 056's full mirror to carry it to auth.users - but 107 DROPPED that trigger,
// and its replacement (exchange.mirror_funds_to_auth) carries dorado_funds and
// nothing else. Left as it was, an attach landed in exchange only, better-auth's
// session (reading auth.users now) kept answering a null stripeCustomerId, and
// every later intent minted a duplicate Stripe customer. The auth-side write
// does fire 107's identity mirror back into exchange, but a dual write states
// both destinations rather than trusting a trigger to imply one.
export const attachCustomerToUser = (customerId, userId, executor) =>
  both(executor, async (c) => {
    const r = await exchange.attachCustomerToUser(customerId, userId, c);
    await next.attachCustomerToUser(customerId, userId, c);
    return r;
  });
