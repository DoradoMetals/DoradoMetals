import * as stripe from "#providers/payment/stripe.ts";
import * as stripeRepo from "#features/payments/repo.ts";
import * as ordersRepo from "#features/orders/repo.ts";
import * as productService from "#features/products/service.ts";
import * as addressService from "#features/places/addresses/service.ts";
import * as taxService from "#features/sales-tax/service.ts";
import * as spotsService from "#features/spots/service.ts";
import { calculateSalesOrderTotal } from "#features/pricing/service.ts";

import { auth } from "#features/auth/client.ts";
import { fromNodeHeaders } from "better-auth/node";
import type {
  PaymentIntentRow,
  StripeIntentLike,
  StripePaymentMethodLike,
} from "#features/payments/repo.ts";
import type { IncomingHttpHeaders } from "node:http";

// WIDER THAN THE REPO'S SessionLike, deliberately. The repo needs only
// session.id and user.id to key an intent; this layer also reads the user's
// Stripe customer id, name and email to open one. Extending rather than
// redeclaring, so the two cannot drift about the part they share.
export type PaymentSession = {
  session: { id: string };
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    stripeCustomerId?: string | null;
    // Declared as a better-auth additionalField in features/auth/client.js, and
    // read by calculateSalesOrderTotal to apply a customer's store credit.
    dorado_funds?: number | null;
  };
};

// auth.api.getSession is a SECOND lookup, not the one requireUser did, so it
// can in principle answer null even on a guarded route. Typed as it is rather
// than as it is assumed to be.
type MaybeSession = PaymentSession | null;

// The Stripe objects these functions hand back. Only the fields this service and
// its callers read are named - not Stripe's whole type, which would be a claim
// about a shape we do not own.
type StripeIntent = {
  id: string;
  status?: string | null;
  amount?: number | null;
  client_secret?: string | null;
};

export async function retrievePaymentIntent(
  type: string | undefined,
  user_id: string | undefined,
  headers: IncomingHttpHeaders
): Promise<StripeIntent> {
  // ANNOTATED, BECAUSE BETTER-AUTH'S INFERRED USER TYPE IS INCOMPLETE HERE.
  //
  // features/auth/client.js declares `dorado_funds` (and the other columns) as
  // additionalFields, so the runtime object carries them - but that file is
  // JavaScript, so TypeScript infers a user with only better-auth's own
  // columns and no dorado_funds at all.
  //
  // That looked like a live money bug on first reading: the order is priced
  // with `user.dorado_funds`, and a type saying the field does not exist would
  // mean a customer's store credit never applied. It does exist; the type does
  // not know it. Checked in client.js before annotating rather than after.
  const session = (await auth.api.getSession({
    headers: fromNodeHeaders(headers),
  })) as MaybeSession;

  // A missing session cannot key an intent lookup - the same 401 the
  // create path answers, surfaced here by the typed repo (the untyped one
  // would have thrown a TypeError on session.session.id).
  if (!session?.session?.id) {
    const err: Error & { statusCode?: number } = new Error(
      "no session - a payment intent cannot be retrieved without one"
    );
    err.statusCode = 401;
    throw err;
  }

  // The repo returns the new shape: the provider's id for the intent is on
  // the attempt - an intent is what was asked for and an attempt is what was
  // tried, and only the attempt has a reference from a provider.
  const vals = await stripeRepo.retrievePaymentIntent(type, session, user_id);
  if (vals?.attempt?.provider_ref) {
    return await stripe.retrieveIntent(vals.attempt.provider_ref);
  } else {
    return await createPaymentIntent(type, user_id, session);
  }
}

export async function createPaymentIntent(
  type: string | undefined,
  user_id: string | undefined,
  session: MaybeSession
): Promise<StripeIntent> {
  // THE NULL-SESSION PATH WAS GUARDED IN TWO PLACES OUT OF FOUR.
  //
  // `session?.user?.stripeCustomerId` and `session?.user?.id` below were
  // optional-chained; `session.user?.name` and `.email` between them were not.
  // So a null session threw a TypeError on exactly the branch a FIRST-TIME
  // payer takes - the one where no Stripe customer exists yet - and answered
  // 500. The compiler found it; the inconsistency is plainly unintended.
  //
  // Guarding once, at the top, rather than optional-chaining the other two:
  // creating a Stripe customer with no name and no email is worse than
  // refusing, and every use below needs session.user.id anyway.
  //
  // 401 rather than the TypeError's 500, because a missing session is an
  // authentication fact and not a server fault. requireUser has already run, so
  // this fires only if auth.api.getSession - a SECOND, independent lookup -
  // disagrees with it.
  if (!session?.user?.id) {
    const err: Error & { statusCode?: number } = new Error(
      "no session - a payment intent cannot be opened without one"
    );
    err.statusCode = 401;
    throw err;
  }

  // WHOSE INTENT THIS IS. On the admin path (type=admin, user_id names a
  // customer) everything below bills THE CUSTOMER: their Stripe customer
  // object, their id in the metadata, their id in the idempotency key. The
  // first version used session.user throughout, which on the admin path is
  // the ADMIN - so admin-opened intents hung off the admin's own Stripe
  // customer, the metadata blamed the admin, and the idempotency key
  // collided across every customer one admin served in a session: the same
  // key returned the FIRST customer's intent for the second customer.
  const target =
    type === "admin"
      ? user_id
        ? await stripeRepo.billingIdentityFor(user_id)
        : null
      : { id: session.user.id, name: session.user.name, email: session.user.email,
          stripeCustomerId: session.user.stripeCustomerId };
  if (!target?.id) {
    const err: Error & { statusCode?: number } = new Error(
      "an admin payment intent must name a customer that exists"
    );
    err.statusCode = 400;
    throw err;
  }

  let customerId = target.stripeCustomerId;
  if (!customerId) {
    const { id } = await stripe.createCustomer({
      name: target.name,
      email: target.email,
    });
    customerId = id;
    await stripeRepo.attachCustomerToUser(customerId, target.id);
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
  //
  // The metadata is the reconciliation lifeline: a webhook payload carries no
  // session, user or type (D25's whole constraint), so they ride on the intent
  // itself - visible in the dashboard, present in exports, and available to
  // reconcile:payments when a row goes missing. The idempotency key makes a
  // network retry return THIS intent instead of minting an orphan: same
  // (type, customer, session) is the same attempt, and audit:payments counts
  // the orphans the old call could create.
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
  // ANNOTATED, BECAUSE BETTER-AUTH'S INFERRED USER TYPE IS INCOMPLETE HERE.
  //
  // features/auth/client.js declares `dorado_funds` (and the other columns) as
  // additionalFields, so the runtime object carries them - but that file is
  // JavaScript, so TypeScript infers a user with only better-auth's own
  // columns and no dorado_funds at all.
  //
  // That looked like a live money bug on first reading: the order is priced
  // with `user.dorado_funds`, and a type saying the field does not exist would
  // mean a customer's store credit never applied. It does exist; the type does
  // not know it. Checked in client.js before annotating rather than after.
  const session = (await auth.api.getSession({
    headers: fromNodeHeaders(headers),
  })) as MaybeSession;

  // Same guard as createPaymentIntent, and for the same reason: `session.user`
  // is dereferenced unguarded further down, where the order is priced.
  if (!session?.user?.id) {
    const err: Error & { statusCode?: number } = new Error(
      "no session - a payment intent cannot be priced without one"
    );
    err.statusCode = 401;
    throw err;
  }

  const retrieved_intent = await stripeRepo.retrievePaymentIntent(
    type,
    session,
    user?.id
  );

  // Guarded rather than widening the addresses service: `address_id` is
  // optional in the body and the tax lookup below already falls back to "TX"
  // when there is no address, so asking for `undefined` would be a query whose
  // answer is thrown away.
  const address = address_id
    ? await addressService.getAddressFromId(address_id)
    : undefined;
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
  const spots = await spotsService.getSpotPrices();

  const items_with_tax = await taxService.attachSalesTaxToItems(
    address?.state ?? "TX",
    server_items,
    spots
  );

  // WHOSE FUNDS THE ORDER IS PRICED AGAINST.
  //
  // An admin placing an order for a customer sends that customer as `user`; a
  // customer buying for themselves is priced against their own session. The
  // original wrote `type === "admin" ? user : session.user` and
  // calculateSalesOrderTotal reads `user.dorado_funds` unguarded - so an admin
  // request that omitted `user` threw a TypeError and answered 500.
  //
  // Refused explicitly instead. Falling back to session.user would be worse
  // than crashing: it would price a customer's order against the ADMIN's
  // credit balance and charge a number nobody can explain.
  const priced_for = type === "admin" ? user : session.user;
  if (!priced_for) {
    const err: Error & { statusCode?: number } = new Error(
      "an admin payment intent must name the customer it is for"
    );
    err.statusCode = 400;
    throw err;
  }

  const orderPrices = calculateSalesOrderTotal(
    items_with_tax,
    using_funds,
    spots,
    priced_for,
    shipping_service,
    payment_method
  );

  const rawAmount = Math.round(orderPrices.post_charges_amount * 100);

  // *** THE $10 FLOOR IS GONE (D199). *** This was Math.max(rawAmount, 1000):
  // a placeholder amount from intent creation, re-imposed on every priced
  // update, so a $3 balance told Stripe $10 - and Stripe charges what the
  // intent says. Production shows it never actually fired (25 intents, zero
  // paid at 1000), and two things retire it for good: pricing now caps applied
  // credit so a card remainder is either zero or >= Stripe's $0.50 minimum
  // (ask.ts), and createSalesOrder sets the authoritative amount server-side
  // at creation, immediately before the browser confirms. Below the Stripe
  // minimum there is nothing legal to update the intent TO, so the intent is
  // left as it stands - checkout gates the card step on
  // post_charges_amount > 0, and creation attaches nothing when the charge is
  // zero, so an unpriceable intent is simply never confirmed.
  if (rawAmount < 50) {
    return retrieved_intent?.attempt?.provider_ref
      ? await stripe.retrieveIntent(retrieved_intent.attempt.provider_ref)
      : await createPaymentIntent(type, user?.id, session);
  }
  const amount = rawAmount;
  if (
    retrieved_intent?.attempt?.provider_ref &&
    [
      "requires_payment_method",
      "requires_confirmation",
      "requires_action",
    ].includes(retrieved_intent?.status ?? "")
  ) {
    // SELF-HEALING when the stored status lied. The gate above reads the
    // LOCAL row, and any missed webhook leaves it saying
    // requires_payment_method while Stripe says canceled - at which point
    // this update throws and checkout dies at the last step, the $126.48
    // shape. Instead: persist what Stripe actually says (a canceled row is
    // exactly what the retrieve filter skips) and mint a fresh intent, so
    // the customer sees a working payment form instead of a 500.
    try {
      const paymentIntent = await stripe.updateIntent(
        retrieved_intent.attempt.provider_ref,
        { amount }
      );
      await stripeRepo.updatePaymentIntent(paymentIntent);
      return paymentIntent;
    } catch (err) {
      const live = await stripe
        .retrieveIntent(retrieved_intent.attempt.provider_ref)
        .catch(() => null);
      if (!live) throw err;
      await stripeRepo.updatePaymentIntent(live);
      if (["canceled", "succeeded", "processing"].includes(live.status ?? "")) {
        return await createPaymentIntent(type, user?.id, session);
      }
      throw err;
    }
  } else {
    return await createPaymentIntent(type, user?.id, session);
  }
}

// A try/catch that only rethrows. Kept: deleting it is a behaviour change in a
// money path, and it is where a log line would go if one is ever wanted.
export async function capturePaymentIntent(
  payment_intent_id: string
): Promise<StripeIntent> {
  try {
    const paymentIntent = await stripe.captureIntent(payment_intent_id);
    return paymentIntent;
  } catch (err) {
    throw err;
  }
}

export async function cancelPaymentIntent({
  payment_intent_id,
}: {
  payment_intent_id: string;
}): Promise<StripeIntent> {
  const paymentIntent = await stripe.cancelIntent(payment_intent_id);
  // PERSISTED HERE, NOT LEFT TO THE WEBHOOK. Stripe just told this process
  // the intent is canceled; recording it only via the webhook meant any
  // environment where deliveries lag or never land (dev has no listener)
  // kept a stale requires_payment_method row - so the next retrieve offered
  // back an intent Stripe will refuse, which is the exact
  // checkout-fails-at-the-last-step shape the $126.48 thread describes.
  // The same idempotent update the webhook path runs; a later delivery
  // rewrites the same values.
  await stripeRepo.updatePaymentIntent(paymentIntent);
  return paymentIntent;
}

export async function updateMethod({
  paymentMethod,
}: {
  paymentMethod?: StripePaymentMethodLike | null;
}): Promise<void> {
  await stripeRepo.updateMethod({ paymentMethod });
}

// D24, decided by Jacob 26 August. A WEBHOOK THAT MATCHES NO ROW IS REFUSED,
// so Stripe retries it.
//
// It used to be accepted silently: the statement is an UPDATE, the controller
// answered `{received:true}` either way, and Stripe recorded a delivery that
// succeeded while nothing here was written. audit:payments counts twenty such
// intents in production, and that is the shape of the missing $126.48 - the
// delivery log cannot show it, because from Stripe's side it went fine.
//
// Retrying is safe. The statement is a straight overwrite, so applying it twice
// writes the same values; the controller's own comment already relies on that
// where a later failure in the same handler makes Stripe retry an update
// already applied.
//
// This does NOT create the missing row - see D25. An intent row needs
// session_id, user_id and type, none of which a webhook payload carries, so
// upserting would mean inventing a user and a session.
// The sweep's cancel (D211): ref-keyed, sessionless - reconcile abandons an
// intent nobody will ever confirm, and PERSISTING the cancellation is what
// makes the abandonment a durable payment FACT the sweep's own candidate
// query excludes next run. Cancelling an already-cancelled intent is a
// Stripe no-op shape; any error surfaces to the sweep, which runs each order
// in its own transaction.
export async function cancelIntentByRef(provider_ref: string): Promise<void> {
  try {
    const canceled = await stripe.cancelIntent(provider_ref);
    await stripeRepo.updatePaymentIntent(canceled);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    // An intent Stripe never heard of (a seeded or pre-sandbox row) or one
    // already cancelled is ABANDONED EITHER WAY - persist the canceled fact
    // locally so the sweep's candidate query excludes it forever. Anything
    // else propagates.
    if (/No such payment_intent|already.*cancel/i.test(msg)) {
      await stripeRepo.updatePaymentIntent({ id: provider_ref, status: "canceled" });
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
  // The SETTLEMENT TRANSITION is detected here, at the payment layer, from
  // the payment fact itself: what the stored intent said before this webhook.
  // A retry arrives with the row already succeeded and changes no label -
  // which is what lets the label write downstream be pure, unguarded flair
  // (D211: statuses drive no logic).
  const prior = await stripeRepo.getVerbatimByIntentId(paymentIntent.id);
  const matched = await stripeRepo.updatePaymentIntent(paymentIntent);
  if (matched === false) {
    const err: Error & { statusCode?: number } = new Error(
      `stripe webhook: no payment intent row for ${paymentIntent.id} - refusing so Stripe retries`
    );
    err.statusCode = 500;
    throw err;
  }

  // *** THE WEBHOOK FINISHES THE ORDER'S LABEL, and only its label (D211).
  // *** Paidness itself is the intent row just written - anything that needs
  // to know reads it there. The flair refresh fires on the real transition
  // only: prior-not-succeeded -> succeeded. A Stripe retry (prior already
  // succeeded) reaches no label, so an admin's later label survives by fact.
  //
  // A succeeded intent with NO order attached is not an error here: the
  // unattached case is the customer who paid and never completed creation -
  // reconcile:payments owns that sweep, and createSalesOrder repairs it on
  // retry.
  if (
    paymentIntent.status === "succeeded" &&
    prior?.payment_status !== "succeeded" &&
    prior?.sales_order_id
  ) {
    // The flair, nothing else (D211): paid is the intent's own settled fact,
    // read where it lives; the label is decoration for the customer.
    await ordersRepo.update(prior.sales_order_id, { status: "Preparing", updated_by: "payment" });
  }
}

export async function getPaymentIntentFromSalesOrderId({
  sales_order_id,
}: {
  sales_order_id: string;
}): Promise<PaymentIntentRow | undefined> {
  return await stripeRepo.getPaymentIntentFromSalesOrderId(sales_order_id);
}
