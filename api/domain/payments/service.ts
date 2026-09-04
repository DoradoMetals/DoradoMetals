// Payments: the orchestration across payments.intents, .attempts and
// .settlements - what a customer is asked for and what they paid.
//
// WHAT STRIPE TELLS US AFTERWARDS is webhook.ts, next door: it was two
// functions here plus a dispatcher in the controller, and it reads as one use
// case with its own load/write/after shape.
//
// AN INTENT IS WHAT WAS ASKED FOR, an attempt is what was tried, a settlement
// is what moved. Each has its own repo; composing them is this file's job.
//
// NOTHING HERE READS A PRICE FROM A CALLER. Every use case takes ids, and the
// amount Stripe is told is derived from the server's own spots, catalogue,
// rates and the customer's own credit row.
import withTransaction from "#shared/db/withTransaction.ts";
import * as stripe from "#providers/payment/stripe.ts";
import {
  paymentIntents as intents, paymentAttempts as attempts,
  paymentSettlements as settlements, paymentMethods as methods,
  paymentCustomers as customers, carrierServices as servicesRepo,
} from "#db";
import {
  products as productService, addresses as addressService,
  salesTax as taxService, spots as spotsService, users as usersService,
  pricing,
} from "#domain";
import {
  toDollars, intentOwner, isOpen, isResolved, chargeCents, isChargeable,
  assertBillingIdentity, assertIntentSubject, assertPriceableBalance,
} from "#domain/payments/rules.ts";

// StripeIntentLike is the provider's shape, not ours - #providers/payment
// is its one home (ruling 60/61), and this is a type-only import of it.
import type { StripeIntentLike } from "#providers/payment/stripe.ts";
import type { PaymentIntentView, PaymentIntentFacts, PaymentCaller } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";
import type { UpdatePaymentIntentBody } from "@dorado/contracts";

// WHO IS ASKING - `PaymentCaller` (@dorado/contracts). An intent is keyed on
// (session_id, user_id, type), so the session's own id is part of the
// question and travels with the caller rather than as request headers the
// domain would have to open a second auth lookup on.

// The reusable intent for this session, keyed on the trio 075 added: without
// session_id, user_id and type the question cannot be asked at all.
async function findReusableIntent(
  caller: PaymentCaller, type: string | undefined, named_user_id: string | undefined,
  executor?: Executor
): Promise<PaymentIntentView | undefined> {
  return await intents.findReusable(
    {
      session_id: caller.session_id,
      user_id: intentOwner(type, caller.user_id, named_user_id),
      type: type ?? null,
    },
    executor
  );
}

export async function retrievePaymentIntent(
  caller: PaymentCaller, type: string | undefined, user_id: string | undefined
): Promise<StripeIntentLike> {
  const open = await findReusableIntent(caller, type, user_id);
  if (open?.attempt?.provider_ref) return await stripe.retrieveIntent(open.attempt.provider_ref);
  return await createPaymentIntent(caller, type, user_id);
}

// WHOSE STRIPE CUSTOMER THIS BILLS. On the admin path the intent bills the
// CUSTOMER - their customer object, their id in the metadata and in the
// idempotency key. Billing the session's user throughout collided the key
// across every customer one admin served in a session.
async function billingIdentity(
  caller: PaymentCaller, type: string | undefined, user_id: string | undefined
) {
  const subject = type === "admin" ? user_id : caller.user_id;
  return assertBillingIdentity(subject ? await customers.getOne(subject) : undefined, type);
}

// THE USE CASE for this write: it opens the one transaction recordIntent
// needs, around that call only. The two Stripe calls stay bare awaits, never
// inside one.
export async function createPaymentIntent(
  caller: PaymentCaller, type: string | undefined, user_id: string | undefined
): Promise<StripeIntentLike> {
  const target = await billingIdentity(caller, type, user_id);

  let customerId = target.stripeCustomerId;
  if (!customerId) {
    const created = await stripe.createCustomer({ name: target.name, email: target.email });
    customerId = created.id;
    await customers.update(target.id, { [customers.STRIPE_CUSTOMER]: customerId });
  }

  const existing = await findReusableIntent(caller, type, user_id);
  if (existing?.attempt?.provider_ref) {
    return await stripe.retrieveIntent(existing.attempt.provider_ref);
  }

  // The placeholder amount is the feature's decision, not Stripe's: an intent
  // is opened before the cart is priced and updated when it is.
  //
  // THE METADATA IS THE RECONCILIATION LIFELINE. A webhook payload carries no
  // session, user or type (D25), so they ride on the intent itself. The
  // idempotency key makes a network retry return THIS intent rather than mint
  // an orphan.
  const paymentIntent = await stripe.createIntent({
    amount: 1000,
    customerId,
    metadata: {
      type: String(type),
      user_id: String(target.id),
      session_id: caller.session_id,
    },
    idempotencyKey: `intent:${type}:${target.id}:${caller.session_id}`,
  });

  await withTransaction((tx) => recordIntent(paymentIntent, caller, type, user_id, tx));
  return paymentIntent;
}

// The intent row and the attempt that carries its provider reference, written
// together: an intent with no attempt can never be found again. They share one
// id, which is what lets a settlement key off the same value. `tx` is REQUIRED
// - the caller (a use case, or a test's own rolled-back transaction) opens it;
// this never does.
export async function recordIntent(
  paymentIntent: StripeIntentLike,
  caller: PaymentCaller,
  type: string | undefined,
  user_id: string | undefined,
  tx: Executor
): Promise<void> {
  const amount_expected = toDollars(paymentIntent.amount);

  const { id: intent_id } = await intents.create(
    {
      session_id: caller.session_id,
      user_id: intentOwner(type, caller.user_id, user_id),
      type: type ?? null,
      status: paymentIntent.status ?? null,
      amount_expected,
    },
    tx
  );
  await attempts.create(
    {
      id: intent_id,
      intent_id,
      provider: "stripe",
      provider_ref: paymentIntent.id,
      amount: amount_expected,
      status: paymentIntent.status ?? null,
    },
    tx
  );
}

// WHAT THE PROVIDER NOW SAYS, applied to the three rows that record it.
// Answers whether it matched anything: a webhook that matches no row must not
// be accepted silently (D24), and the statements are straight overwrites, so
// applying them twice writes the same values. `tx` is REQUIRED - the caller
// (a use case, or a test's own rolled-back transaction) opens it.
export async function updateFromProvider(
  paymentIntent: StripeIntentLike, tx: Executor
): Promise<boolean> {
  const attempt = await attempts.findByProviderRef(paymentIntent.id, tx);
  if (!attempt) return false;
  const { id: attempt_id, intent_id } = attempt;

  const { status, amount_received } = paymentIntent;
  const amount_expected = toDollars(paymentIntent.amount);

  const matched = await intents.update(
    intent_id, { status: status ?? undefined, amount_expected }, tx
  );
  if (!matched) return false;
  await attempts.update(
    attempt_id, { status: status ?? undefined, amount: amount_expected }, tx
  );

  // A SETTLEMENT ONLY EXISTS ONCE MONEY HAS MOVED, and nothing un-moves it -
  // a later failed webhook overwrites the intent's status and leaves this
  // alone.
  if ((amount_received ?? 0) > 0) {
    await settlements.create(
      attempt_id, attempt_id,
      {
        settled_amount: toDollars(amount_received) as number,
        provider: "stripe",
        provider_ref: paymentIntent.id,
      },
      tx
    );
  }
  return true;
}

// The payment facts for one provider reference - what order creation decides
// on (D211). The amount is in CENTS; see the repo's own statement.
export async function findIntentByRef(
  provider_ref: string, executor?: Executor
): Promise<PaymentIntentFacts | undefined> {
  return await intents.findFactsByRef(provider_ref, executor);
}

// orders.orders is ONE table with a direction, so whichever order is named is
// the order. Passing null detaches.
export async function attachOrder(
  provider_ref: string, order_id: string | null, executor?: Executor
): Promise<boolean> {
  const attempt = await attempts.findByProviderRef(provider_ref, executor);
  if (!attempt) return false;
  return await intents.update(attempt.intent_id, { order_id }, executor);
}

// THE CART, PRICED, AND STRIPE TOLD WHAT TO CHARGE.
//
// LOAD the rows the ids name, PRICE them from the server's own feed, then
// update or mint the intent. The delivery service and the payment method are
// ids resolved to their own rows here, exactly as placement resolves them from
// the checkout, so the intent and the order it pays for price identically.
//
// *** THE CHARGE AMOUNT IS PRICED FROM THE SERVER'S SPOTS, NOT THE CALLER'S. ***
// `spots` used to arrive in the body and feed the pricing call: ask_spot 3400
// priced $3,673.53 and ask_spot 1 priced $26.81 on the same order. They are
// fetched fresh on every update, so a revised intent carries the current price.
export async function updatePaymentIntent(
  caller: PaymentCaller,
  { items, address_id, carrier_service_id, payment_method_id, user_id, type }: UpdatePaymentIntentBody
): Promise<StripeIntentLike> {
  // WHOSE ORDER THIS PRICES. Falling back to the session user on the admin path
  // would price a customer's order against the ADMIN's credit balance and
  // charge a number nobody can explain, so it refuses instead.
  const subject = assertIntentSubject(type === "admin" ? user_id : caller.user_id);

  // THE BALANCE IS THE SERVER'S FACT, read from the customer's own row. It used
  // to arrive in the body as `user.dorado_funds`, which let a request declare
  // the credit it was discounted by.
  const dorado_funds = assertPriceableBalance(subject, await usersService.getBalance(subject));

  const retrieved_intent = await findReusableIntent(caller, type, user_id);

  // Guarded rather than widening the addresses service: the tax lookup below
  // already falls back to "TX" when there is no address.
  const address = address_id ? await addressService.getAddressFromId(address_id) : undefined;
  const service = carrier_service_id ? await servicesRepo.getOne(carrier_service_id) : undefined;
  const method = payment_method_id ? await methods.getOne(payment_method_id) : undefined;

  const spots = await spotsService.getSpotPrices();
  const items_with_tax = await taxService.attachSalesTaxToItems(
    address?.state ?? "TX",
    await productService.getItemsFromServer(items),
    spots
  );

  // Credit is applied whenever the customer has a balance - the same rule
  // placement uses, so the intent's amount is the order's amount. The pricing
  // caps what is applied at the order's own total and holds back a sliver
  // below Stripe's minimum.
  const prices = pricing.calculateSalesOrderTotal(
    items_with_tax, spots, { dorado_funds }, service?.code, method?.type
  );
  const amount = chargeCents(prices.post_charges_amount);

  // *** NO $10 FLOOR (D199). *** Math.max(rawAmount, 1000) re-imposed the
  // placeholder on every priced update, so a $3 balance told Stripe $10 - and
  // Stripe charges what the intent says. Below Stripe's minimum there is
  // nothing legal to update the intent TO, so it is left as it stands.
  if (!isChargeable(amount)) {
    return retrieved_intent?.attempt?.provider_ref
      ? await stripe.retrieveIntent(retrieved_intent.attempt.provider_ref)
      : await createPaymentIntent(caller, type, user_id);
  }

  const provider_ref = retrieved_intent?.attempt?.provider_ref;
  if (!provider_ref || !isOpen(retrieved_intent?.status)) {
    return await createPaymentIntent(caller, type, user_id);
  }

  // LOAD Stripe's live status before writing, rather than reacting to a
  // failed write: a missed webhook can leave the local row saying
  // requires_payment_method while Stripe already says canceled.
  const live = await stripe.retrieveIntent(provider_ref);
  await withTransaction((tx) => updateFromProvider(live, tx));
  if (isResolved(live.status)) return await createPaymentIntent(caller, type, user_id);

  const paymentIntent = await stripe.updateIntent(provider_ref, { amount });
  await withTransaction((tx) => updateFromProvider(paymentIntent, tx));
  return paymentIntent;
}

export async function capturePaymentIntent(payment_intent_id: string): Promise<StripeIntentLike> {
  return await stripe.captureIntent(payment_intent_id);
}

export async function cancelPaymentIntent(payment_intent_id: string): Promise<StripeIntentLike> {
  const paymentIntent = await stripe.cancelIntent(payment_intent_id);
  // PERSISTED HERE, NOT LEFT TO THE WEBHOOK. Recording it only on delivery
  // meant any environment where deliveries lag kept a stale
  // requires_payment_method row, so the next retrieve offered back an intent
  // Stripe will refuse.
  await withTransaction((tx) => updateFromProvider(paymentIntent, tx));
  return paymentIntent;
}

// THE SWEEP'S CANCEL. No tolerance for "already canceled" / "unknown intent"
// is needed here any more: providers/payment/stripe.ts translates both states
// at the boundary, so this is one line and any real failure propagates and is
// retried next run rather than being written off.
export async function cancelIntentByRef(provider_ref: string): Promise<void> {
  const canceled = await stripe.cancelIntent(provider_ref);
  await withTransaction((tx) => updateFromProvider(canceled, tx));
}

// Named for the admin sales-order screen; the parameter is just order_id.
export async function getPaymentIntentFromSalesOrderId(
  order_id: string
): Promise<PaymentIntentView | undefined> {
  return await intents.findForOrder(order_id);
}
