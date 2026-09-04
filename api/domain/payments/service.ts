// Payments: the orchestration across payments.intents, .attempts, .settlements
// and .details, and the one place a Stripe call is made from.
//
// AN INTENT IS WHAT WAS ASKED FOR, an attempt is what was tried, a settlement
// is what moved. Each has its own repo; composing them is this file's job.
//
// NOTHING HERE READS A PRICE FROM A CALLER. Every use case takes ids, and the
// amount Stripe is told is derived from the server's own spots, catalogue,
// rates and the customer's own credit row.
import withTransaction from "#shared/db/withTransaction.ts";
import * as stripe from "#providers/payment/stripe.ts";
import * as intents from "#db/payments/intents/repo.ts";
import * as attempts from "#db/payments/attempts/repo.ts";
import * as settlements from "#db/payments/settlements/repo.ts";
import * as details from "#db/payments/details/repo.ts";
import * as methods from "#db/payments/methods/repo.ts";
import * as customers from "#db/payments/customers/repo.ts";
import * as servicesRepo from "#db/shipping/services/repo.ts";
import * as ordersRepo from "#db/orders/repo.ts";
import * as productService from "#domain/products/service.ts";
import * as addressService from "#domain/places/addresses/service.ts";
import * as taxService from "#domain/sales-tax/service.ts";
import * as spotsService from "#domain/spots/service.ts";
import * as usersService from "#domain/users/service.ts";
import { calculateSalesOrderTotal } from "#domain/pricing/service.ts";
import {
  toDollars, intentOwner, isOpen, isResolved, methodTypeFor, instrumentValues,
  chargeCents, isChargeable,
} from "#domain/payments/rules.ts";
import { Forbidden, Invalid, NotFound } from "#shared/errors.ts";

import type { StripeIntentLike, StripePaymentMethodLike } from "#domain/payments/rules.ts";
import type { ComposedIntentRow, IntentFacts } from "#db/payments/intents/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { UpdatePaymentIntentBody } from "@dorado/contracts";

export type { ComposedIntentRow, IntentFacts } from "#db/payments/intents/repo.ts";
export type { StripeIntentLike, StripePaymentMethodLike } from "#domain/payments/rules.ts";

// WHO IS ASKING, resolved by the guard and handed down as ids. An intent is
// keyed on (session_id, user_id, type), so the session's own id is part of the
// question and travels with the caller rather than as request headers the
// domain would have to open a second auth lookup on.
export type Caller = { session_id: string; user_id: string };

// The Stripe objects these functions hand back - only the fields anything here
// reads, not a claim about a shape we do not own.
type StripeIntent = {
  id: string;
  status?: string | null;
  amount?: number | null;
  client_secret?: string | null;
};

// Several writes that must land together, on the caller's transaction when it
// has one and in one of our own when it does not. No Stripe call goes inside.
function together<T>(
  executor: Executor, fn: (client: Executor) => Promise<T>
): Promise<T> {
  return executor ? fn(executor) : withTransaction((client) => fn(client));
}

// The reusable intent for this session, keyed on the trio 075 added: without
// session_id, user_id and type the question cannot be asked at all.
async function findReusableIntent(
  caller: Caller, type: string | undefined, named_user_id: string | undefined,
  executor?: Executor
): Promise<ComposedIntentRow | undefined> {
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
  caller: Caller, type: string | undefined, user_id: string | undefined
): Promise<StripeIntent> {
  const open = await findReusableIntent(caller, type, user_id);
  if (open?.attempt?.provider_ref) return await stripe.retrieveIntent(open.attempt.provider_ref);
  return await createPaymentIntent(caller, type, user_id);
}

// WHOSE STRIPE CUSTOMER THIS BILLS. On the admin path the intent bills the
// CUSTOMER - their customer object, their id in the metadata and in the
// idempotency key. Billing the session's user throughout collided the key
// across every customer one admin served in a session.
async function billingIdentity(
  caller: Caller, type: string | undefined, user_id: string | undefined,
  executor?: Executor
) {
  if (type !== "admin") {
    const identity = await customers.getOne(caller.user_id, executor);
    if (!identity?.id) throw new Forbidden("no user row for this session");
    return identity;
  }
  const identity = user_id ? await customers.getOne(user_id, executor) : undefined;
  if (!identity?.id) {
    throw new Invalid("an admin payment intent must name a customer that exists");
  }
  return identity;
}

// The optional executor is for a caller that already holds a transaction -
// it is never opened here. Passed straight down to recordIntent so the
// intent row and its attempt still commit as one write; leaving it un-threaded
// was the bug: recordIntent's own together() had no executor to join, so it
// opened a SECOND transaction on a fresh connection instead of the caller's.
// The two Stripe calls above stay bare awaits either way - never inside one.
export async function createPaymentIntent(
  caller: Caller, type: string | undefined, user_id: string | undefined,
  executor?: Executor
): Promise<StripeIntent> {
  const target = await billingIdentity(caller, type, user_id, executor);

  let customerId = target.stripeCustomerId;
  if (!customerId) {
    const created = await stripe.createCustomer({ name: target.name, email: target.email });
    customerId = created.id;
    await customers.update(target.id, { [customers.STRIPE_CUSTOMER]: customerId }, executor);
  }

  const existing = await findReusableIntent(caller, type, user_id, executor);
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

  await recordIntent(paymentIntent, caller, type, user_id, executor);
  return paymentIntent;
}

// The intent row and the attempt that carries its provider reference, written
// together: an intent with no attempt can never be found again. They share one
// id, which is what lets a settlement key off the same value.
export async function recordIntent(
  paymentIntent: StripeIntentLike,
  caller: Caller,
  type: string | undefined,
  user_id: string | undefined,
  executor?: Executor
): Promise<void> {
  const amount_expected = toDollars(paymentIntent.amount);

  await together(executor, async (client) => {
    const { id: intent_id } = await intents.create(
      {
        session_id: caller.session_id,
        user_id: intentOwner(type, caller.user_id, user_id),
        type: type ?? null,
        status: paymentIntent.status ?? null,
        amount_expected,
      },
      client
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
      client
    );
  });
}

// WHAT THE PROVIDER NOW SAYS, applied to the three rows that record it.
// Answers whether it matched anything: a webhook that matches no row must not
// be accepted silently (D24), and the statements are straight overwrites, so
// applying them twice writes the same values.
export async function updateFromProvider(
  paymentIntent: StripeIntentLike, executor?: Executor
): Promise<boolean> {
  const attempt = await attempts.findByProviderRef(paymentIntent.id, executor);
  if (!attempt) return false;
  const { id: attempt_id, intent_id } = attempt;

  const { status, amount_received } = paymentIntent;
  const amount_expected = toDollars(paymentIntent.amount);

  return await together(executor, async (client) => {
    const matched = await intents.update(
      intent_id, { status: status ?? undefined, amount_expected }, client
    );
    if (!matched) return false;
    await attempts.update(
      attempt_id, { status: status ?? undefined, amount: amount_expected }, client
    );

    // A SETTLEMENT ONLY EXISTS ONCE MONEY HAS MOVED, and nothing un-moves it -
    // a later failed webhook overwrites the intent's status and leaves this
    // alone.
    if ((amount_received ?? 0) > 0) {
      await settlements.create(
        {
          id: attempt_id,
          attempt_id,
          settled_amount: toDollars(amount_received) as number,
          provider: "stripe",
          provider_ref: paymentIntent.id,
        },
        client
      );
    }
    return true;
  });
}

// The payment facts for one provider reference - what order creation decides
// on (D211). The amount is in CENTS; see the repo's own statement.
export async function findIntentByRef(
  provider_ref: string, executor?: Executor
): Promise<IntentFacts | undefined> {
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
  caller: Caller,
  { items, address_id, carrier_service_id, payment_method_id, user_id, type }: UpdatePaymentIntentBody
): Promise<StripeIntent> {
  // WHOSE ORDER THIS PRICES. Falling back to the session user on the admin path
  // would price a customer's order against the ADMIN's credit balance and
  // charge a number nobody can explain, so it refuses instead.
  const subject = type === "admin" ? user_id : caller.user_id;
  if (!subject) throw new Invalid("an admin payment intent must name the customer it is for");

  // THE BALANCE IS THE SERVER'S FACT, read from the customer's own row. It used
  // to arrive in the body as `user.dorado_funds`, which let a request declare
  // the credit it was discounted by.
  const balance = await usersService.getBalance(subject);
  if (balance === undefined) throw new NotFound(`no user ${subject} to price this intent for`);
  const dorado_funds = Number(balance ?? 0);

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
  const prices = calculateSalesOrderTotal(
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
  await updateFromProvider(live);
  if (isResolved(live.status)) return await createPaymentIntent(caller, type, user_id);

  const paymentIntent = await stripe.updateIntent(provider_ref, { amount });
  await updateFromProvider(paymentIntent);
  return paymentIntent;
}

export async function capturePaymentIntent(payment_intent_id: string): Promise<StripeIntent> {
  return await stripe.captureIntent(payment_intent_id);
}

export async function cancelPaymentIntent(payment_intent_id: string): Promise<StripeIntent> {
  const paymentIntent = await stripe.cancelIntent(payment_intent_id);
  // PERSISTED HERE, NOT LEFT TO THE WEBHOOK. Recording it only on delivery
  // meant any environment where deliveries lag kept a stale
  // requires_payment_method row, so the next retrieve offered back an intent
  // Stripe will refuse.
  await updateFromProvider(paymentIntent);
  return paymentIntent;
}

// The instrument Stripe says was used, recorded against the method row that
// names it. Found by the provider's id for it - 077 gave payments.details the
// (provider, provider_ref) key.
export async function updateMethod(
  paymentMethod: StripePaymentMethodLike | null | undefined
): Promise<void> {
  const type = methodTypeFor(paymentMethod?.type);
  const method = type ? await methods.findByType("sale", type) : undefined;
  const values = instrumentValues(paymentMethod, method?.id ?? null);
  if (!values.provider_ref) return;

  const existing = await details.findByProviderRef("stripe", values.provider_ref);
  if (existing) {
    await details.update(existing.id, values);
    return;
  }

  // *** THIS CANNOT WRITE A NEW ROW TODAY, and that is a known open thread
  // rather than a regression: payments.details.user_id is NOT NULL and a
  // webhook payload names no customer, so a first sighting of an instrument
  // raises 23502. Attributing it needs Jacob's decision (WAVES.md). ***
  throw new Invalid("a payment instrument arrived for a customer this webhook cannot name - " +
      "payments.details.user_id has no value to take");
}

// D24, decided by Jacob 26 August. A WEBHOOK THAT MATCHES NO ROW IS REFUSED,
// so Stripe retries it. It used to be accepted silently while nothing here was
// written, which is the shape of the missing $126.48.
//
// It does NOT create the missing row (D25): an intent needs session_id,
// user_id and type, none of which a webhook payload carries.
// No tolerance for "already canceled" / "unknown intent" any more (Jacob,
// 2026-09-03: no try/catch in domain/transport) - either now throws instead
// of being persisted as canceled. Flagged for FOLLOWUPS, not solved here.
// Any failure (unknown intent, already canceled, a Stripe hiccup) is written
// off the same way: the sweep has already decided to abandon this intent.
export async function cancelIntentByRef(provider_ref: string): Promise<void> {
  await updateFromProvider(await stripe.cancelIntent(provider_ref));
}

export async function updateIntentFromWebhook(
  paymentIntent: StripeIntentLike
): Promise<void> {
  // The SETTLEMENT TRANSITION is detected from the payment fact itself: what
  // the stored intent said before this webhook. A retry arrives with the row
  // already succeeded and changes no label, which is what lets the label write
  // below be pure, unguarded flair (D211).
  const prior = await findIntentByRef(paymentIntent.id);
  const matched = await updateFromProvider(paymentIntent);
  if (!matched) {
    throw new Error(`stripe webhook: no payment intent row for ${paymentIntent.id} - refusing so Stripe retries`);
  }

  // THE WEBHOOK FINISHES THE ORDER'S LABEL, AND ONLY ITS LABEL (D211).
  // Paidness itself is the intent row just written. A succeeded intent with no
  // order attached is not an error: that is the customer who paid and never
  // completed creation, and reconcile:payments owns the sweep.
  if (
    paymentIntent.status === "succeeded" &&
    prior?.payment_status !== "succeeded" &&
    prior?.direction === "sale" &&
    prior?.order_id
  ) {
    await ordersRepo.update(prior.order_id, { status: "Preparing" });
  }
}

// Named for the admin sales-order screen; the parameter is just order_id.
export async function getPaymentIntentFromSalesOrderId(
  order_id: string
): Promise<ComposedIntentRow | undefined> {
  return await intents.findForOrder(order_id);
}
