// Payments: the orchestration across payments.intents, .attempts, .settlements
// and .details, and the one place a Stripe call is made from.
//
// AN INTENT IS WHAT WAS ASKED FOR, an attempt is what was tried, a settlement
// is what moved. Each has its own repo; composing them is this file's job.
import withTransaction from "#shared/db/withTransaction.ts";
import * as stripe from "#providers/payment/stripe.ts";
import * as intents from "#db/payments/intents/repo.ts";
import * as attempts from "#db/payments/attempts/repo.ts";
import * as settlements from "#db/payments/settlements/repo.ts";
import * as details from "#db/payments/details/repo.ts";
import * as methods from "#db/payments/methods/repo.ts";
import * as customers from "#db/payments/customers/repo.ts";
import * as ordersRepo from "#db/orders/repo.ts";
import * as productService from "#domain/products/service.ts";
import * as addressService from "#domain/places/addresses/service.ts";
import * as taxService from "#domain/sales-tax/service.ts";
import * as spotsService from "#domain/spots/service.ts";
import { calculateSalesOrderTotal } from "#domain/pricing/service.ts";
import {
  toDollars, intentOwner, isOpen, isResolved, methodTypeFor, instrumentValues,
} from "#domain/payments/rules.ts";
import { refuse } from "#shared/http/refuse.ts";

import { auth } from "#domain/auth/client.ts";
import { fromNodeHeaders } from "better-auth/node";
import type { StripeIntentLike, StripePaymentMethodLike } from "#domain/payments/rules.ts";
import type { ComposedIntentRow, IntentFacts } from "#db/payments/intents/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { IncomingHttpHeaders } from "node:http";

export type { ComposedIntentRow, IntentFacts } from "#db/payments/intents/repo.ts";
export type { StripeIntentLike, StripePaymentMethodLike } from "#domain/payments/rules.ts";

// WIDER THAN WHAT KEYS AN INTENT, deliberately: this layer also reads the
// user's Stripe customer id, name and email to open one.
export type PaymentSession = {
  session: { id: string };
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    stripeCustomerId?: string | null;
    // A better-auth additionalField, read by calculateSalesOrderTotal to apply
    // a customer's store credit.
    dorado_funds?: number | null;
  };
};

// auth.api.getSession is a SECOND lookup, not the one requireUser did, so it
// can answer null even on a guarded route.
type MaybeSession = PaymentSession | null;

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

async function sessionFrom(headers: IncomingHttpHeaders): Promise<MaybeSession> {
  // ANNOTATED BECAUSE BETTER-AUTH'S INFERRED USER TYPE IS INCOMPLETE: the
  // additionalFields (dorado_funds among them) are declared in the auth client
  // and carried at runtime, but not inferred.
  return (await auth.api.getSession({ headers: fromNodeHeaders(headers) })) as MaybeSession;
}

export async function retrievePaymentIntent(
  type: string | undefined,
  user_id: string | undefined,
  headers: IncomingHttpHeaders
): Promise<StripeIntent> {
  const session = await sessionFrom(headers);
  if (!session?.session?.id) {
    throw refuse(401, "no session - a payment intent cannot be retrieved without one");
  }

  const open = await findReusableIntent(type, user_id, session);
  if (open?.attempt?.provider_ref) return await stripe.retrieveIntent(open.attempt.provider_ref);
  return await createPaymentIntent(type, user_id, session);
}

// The reusable intent for this session, keyed on the trio 075 added: without
// session_id, user_id and type the question cannot be asked at all.
async function findReusableIntent(
  type: string | undefined,
  user_id: string | undefined,
  session: PaymentSession,
  executor?: Executor
): Promise<ComposedIntentRow | undefined> {
  return await intents.findReusable(
    {
      session_id: session.session.id,
      user_id: intentOwner(type, session.user.id, user_id),
      type: type ?? null,
    },
    executor
  );
}

export async function createPaymentIntent(
  type: string | undefined,
  user_id: string | undefined,
  session: MaybeSession
): Promise<StripeIntent> {
  // 401 rather than a TypeError's 500: a missing session is an authentication
  // fact, not a server fault. requireUser has already run, so this fires only
  // when the second, independent lookup disagrees with it.
  if (!session?.user?.id) {
    throw refuse(401, "no session - a payment intent cannot be opened without one");
  }

  const { id, name, email, stripeCustomerId } = session.user;
  const target =
    type === "admin"
      ? user_id
        ? await customers.getOne(user_id)
        : undefined
      : { id, name, email, stripeCustomerId };
  if (!target?.id) {
    throw refuse(400, "an admin payment intent must name a customer that exists");
  }

  let customerId = target.stripeCustomerId;
  if (!customerId) {
    const { name: customerName, email: customerEmail } = target;
    const created = await stripe.createCustomer({ name: customerName, email: customerEmail });
    customerId = created.id;
    await customers.update(target.id, { [customers.STRIPE_CUSTOMER]: customerId });
  }

  const existing = await findReusableIntent(type, user_id, session);
  if (existing?.attempt?.provider_ref) {
    return await stripe.retrieveIntent(existing.attempt.provider_ref);
  }

  // The placeholder amount is the feature's decision, not Stripe's: an intent
  // is opened before the cart is priced and updated when it is.
  //
  // THE METADATA IS THE RECONCILIATION LIFELINE. A webhook payload carries no
  // session, user or type (D25), so they ride on the intent itself - visible
  // in the dashboard, present in exports, available to reconcile:payments. The
  // idempotency key makes a network retry return THIS intent rather than mint
  // an orphan.
  const paymentIntent = await stripe.createIntent({
    amount: 1000,
    customerId,
    metadata: {
      type: String(type),
      user_id: String(target.id),
      session_id: String(session.session?.id ?? ""),
    },
    idempotencyKey: `intent:${type}:${target.id}:${session.session?.id ?? "no-session"}`,
  });

  await recordIntent(paymentIntent, type, user_id, session);
  return paymentIntent;
}

// The intent row and the attempt that carries its provider reference, written
// together: an intent with no attempt can never be found again. They share one
// id, which is what lets a settlement key off the same value.
export async function recordIntent(
  paymentIntent: StripeIntentLike,
  type: string | undefined,
  user_id: string | undefined,
  session: PaymentSession,
  executor?: Executor
): Promise<void> {
  const { status, amount } = paymentIntent;
  const amount_expected = toDollars(amount);

  await together(executor, async (client) => {
    const { id: intent_id } = await intents.create(
      {
        session_id: session.session.id,
        user_id: intentOwner(type, session.user.id, user_id),
        type: type ?? null,
        status: status ?? null,
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
        status: status ?? null,
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

  const { status, amount, amount_received } = paymentIntent;
  const amount_expected = toDollars(amount);

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
  }: {
    items: { id: string; quantity: number }[];
    using_funds?: boolean | null;
    shipping_service?: string | null;
    payment_method?: string | null;
    // On the admin path this is the CUSTOMER, and it carries their credit
    // balance - calculateSalesOrderTotal prices against `dorado_funds`.
    user?: { id?: string; dorado_funds?: number | null } | null;
    type?: string;
    address_id?: string;
  },
  headers: IncomingHttpHeaders
): Promise<StripeIntent> {
  const session = await sessionFrom(headers);
  if (!session?.user?.id) {
    throw refuse(401, "no session - a payment intent cannot be priced without one");
  }

  const retrieved_intent = await findReusableIntent(type, user?.id, session);

  // Guarded rather than widening the addresses service: the tax lookup below
  // already falls back to "TX" when there is no address.
  const address = address_id ? await addressService.getAddressFromId(address_id) : undefined;
  const server_items = await productService.getItemsFromServer(items);

  // *** THE CHARGE AMOUNT IS PRICED FROM THE SERVER'S SPOTS, NOT THE
  // CALLER'S. *** `spots` arrived in the request body, fed
  // calculateSalesOrderTotal, and the result became the Stripe amount:
  // ask_spot 3400 priced $3,673.53 and ask_spot 1 priced $26.81 on the same
  // order. Fetched fresh on every update, so a revised intent carries the
  // current price rather than the one from whenever the session started.
  const spots = await spotsService.getSpotPrices();

  const items_with_tax = await taxService.attachSalesTaxToItems(
    address?.state ?? "TX",
    server_items,
    spots
  );

  // WHOSE FUNDS THE ORDER IS PRICED AGAINST. Falling back to session.user on
  // the admin path would price a customer's order against the ADMIN's credit
  // balance and charge a number nobody can explain, so it refuses instead.
  const sessionUser = session.user;
  const priced_for = type === "admin" ? user : sessionUser;
  if (!priced_for) {
    throw refuse(400, "an admin payment intent must name the customer it is for");
  }

  const orderPrices = calculateSalesOrderTotal(
    items_with_tax,
    using_funds,
    spots,
    priced_for,
    shipping_service,
    payment_method
  );

  const amount = Math.round(orderPrices.post_charges_amount * 100);

  // *** NO $10 FLOOR (D199). *** Math.max(rawAmount, 1000) re-imposed the
  // placeholder on every priced update, so a $3 balance told Stripe $10 - and
  // Stripe charges what the intent says. Below Stripe's minimum there is
  // nothing legal to update the intent TO, so it is left as it stands:
  // checkout gates the card step on post_charges_amount > 0, and creation
  // attaches nothing when the charge is zero.
  if (amount < 50) {
    return retrieved_intent?.attempt?.provider_ref
      ? await stripe.retrieveIntent(retrieved_intent.attempt.provider_ref)
      : await createPaymentIntent(type, user?.id, session);
  }

  const provider_ref = retrieved_intent?.attempt?.provider_ref;
  if (!provider_ref || !isOpen(retrieved_intent?.status)) {
    return await createPaymentIntent(type, user?.id, session);
  }

  try {
    const paymentIntent = await stripe.updateIntent(provider_ref, { amount });
    await updateFromProvider(paymentIntent);
    return paymentIntent;
  } catch (err) {
    // SELF-HEALING WHEN THE STORED STATUS LIED. The gate above reads the LOCAL
    // row, and a missed webhook leaves it saying requires_payment_method while
    // Stripe says canceled - at which point checkout dies at the last step, the
    // $126.48 shape. Persist what Stripe actually says and mint a fresh intent.
    const live = await stripe.retrieveIntent(provider_ref).catch(() => null);
    if (!live) throw err;
    await updateFromProvider(live);
    if (isResolved(live.status)) return await createPaymentIntent(type, user?.id, session);
    throw err;
  }
}

export async function capturePaymentIntent(payment_intent_id: string): Promise<StripeIntent> {
  return await stripe.captureIntent(payment_intent_id);
}

export async function cancelPaymentIntent({
  payment_intent_id,
}: {
  payment_intent_id: string;
}): Promise<StripeIntent> {
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
export async function updateMethod({
  paymentMethod,
}: {
  paymentMethod?: StripePaymentMethodLike | null;
}): Promise<void> {
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
  throw refuse(
    422,
    "a payment instrument arrived for a customer this webhook cannot name - " +
      "payments.details.user_id has no value to take"
  );
}

// D24, decided by Jacob 26 August. A WEBHOOK THAT MATCHES NO ROW IS REFUSED,
// so Stripe retries it. It used to be accepted silently while nothing here was
// written, which is the shape of the missing $126.48.
//
// It does NOT create the missing row (D25): an intent needs session_id,
// user_id and type, none of which a webhook payload carries.
export async function cancelIntentByRef(provider_ref: string): Promise<void> {
  try {
    const canceled = await stripe.cancelIntent(provider_ref);
    await updateFromProvider(canceled);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    // An intent Stripe never heard of, or one already cancelled, is ABANDONED
    // either way - persisting the fact is what makes the sweep's candidate
    // query exclude it forever. Anything else propagates.
    if (/No such payment_intent|already.*cancel/i.test(msg)) {
      await updateFromProvider({ id: provider_ref, status: "canceled" });
      return;
    }
    throw err;
  }
}

export async function updateIntentFromWebhook({
  paymentIntent,
}: {
  paymentIntent: StripeIntentLike;
}): Promise<void> {
  // The SETTLEMENT TRANSITION is detected from the payment fact itself: what
  // the stored intent said before this webhook. A retry arrives with the row
  // already succeeded and changes no label, which is what lets the label write
  // below be pure, unguarded flair (D211).
  const prior = await findIntentByRef(paymentIntent.id);
  const matched = await updateFromProvider(paymentIntent);
  if (!matched) {
    throw refuse(
      500,
      `stripe webhook: no payment intent row for ${paymentIntent.id} - refusing so Stripe retries`
    );
  }

  // THE WEBHOOK FINISHES THE ORDER'S LABEL, AND ONLY ITS LABEL (D211).
  // Paidness itself is the intent row just written. A succeeded intent with no
  // order attached is not an error: that is the customer who paid and never
  // completed creation, and reconcile:payments owns the sweep.
  if (
    paymentIntent.status === "succeeded" &&
    prior?.payment_status !== "succeeded" &&
    prior?.sales_order_id
  ) {
    await ordersRepo.update(prior.sales_order_id, { status: "Preparing" });
  }
}

export async function getPaymentIntentFromSalesOrderId({
  sales_order_id,
}: {
  sales_order_id: string;
}): Promise<ComposedIntentRow | undefined> {
  return await intents.findForOrder(sales_order_id);
}
