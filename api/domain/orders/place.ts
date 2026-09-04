// PLACING AN ORDER: one checkout id in (ruling 43), the order out.
//
//   LOAD -> ASSERT -> WRITE -> OUTSIDE WORLD
//
// THE WRITE IS SQL THAT COPIES (ruling 66, Jacob: "I also hate all those
// returns"). The order, its lines, its frozen spots and a purchase's totals
// are `INSERT … SELECT`s off checkout.checkouts, checkout.items and
// spots.spots - the columns share names, so nothing here maps one row shape
// into another. What is still passed is what was DECIDED: the status, the
// payout fee, and a sale's three per-line figures.
//
// THE CARRIER IS NOT THIS FILE'S BUSINESS (ruling 67). A purchase that SHIPS
// asks domain/shipping to commit the parcel shell and, after the commit, to
// buy its label. A purchase that Dorado COLLECTS, or that the customer brings
// in, writes its booking and buys nothing (Jacob, 2026-09-04: "If it's a
// direct or pickup, why would it need shipper_address_id or package_id?").
import type { PoolClient } from "pg";

import * as ordersRepo from "#db/orders/repo.ts";
import * as orderItems from "#db/orders/items/repo.ts";
import * as orderSpots from "#db/orders/spots/repo.ts";
import * as orderAddresses from "#db/orders/addresses/repo.ts";
import * as orderTransactions from "#db/orders/transactions/repo.ts";
import * as paymentMethods from "#db/payments/methods/repo.ts";
import * as intentsRepo from "#db/payments/intents/repo.ts";
import * as placeAddresses from "#db/places/addresses/repo.ts";
import * as usersRepo from "#db/users/repo.ts";
import * as servicesRepo from "#db/shipping/services/repo.ts";
import * as packagesRepo from "#db/shipping/packages/repo.ts";

import * as addressService from "#domain/places/addresses/service.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
import * as fulfillmentShipments from "#domain/fulfillments/shipments/service.ts";
import * as checkoutService from "#domain/checkout/service.ts";
import * as emailService from "#domain/media/emails/service.ts";
import * as spotsService from "#domain/spots/service.ts";
import * as productService from "#domain/products/service.ts";
import * as taxService from "#domain/sales-tax/service.ts";
import * as paymentsService from "#domain/payments/service.ts";
import * as usersService from "#domain/users/service.ts";
import * as transactionsService from "#domain/transactions/service.ts";
import * as refinerService from "#domain/refiners/service.ts";
import * as sweeps from "#domain/payments/sweeps.ts";
import * as stripeProvider from "#providers/payment/stripe.ts";
import * as orderRead from "#domain/orders/read.ts";
import * as rules from "#domain/orders/rules.ts";
import * as shippingLabels from "#domain/shipping/labels.ts";
import * as shippingRules from "#domain/shipping/rules.ts";
import { calculateItemAsk, calculateSalesOrderTotal } from "#domain/pricing/ask.ts";
import { retierPremiums } from "#domain/orders/service.ts";

import withTransaction from "#shared/db/withTransaction.ts";
import { attempt } from "#shared/attempt.ts";
import type { Checkout, OrderItem, OrderLine, OrderView } from "@dorado/contracts";

// -------------------- the outside world

// THE THREE CALLS A PLACEMENT CANNOT ROLL BACK, injected as sendToRefiner's
// transport is: a test drives the real row flow with no provider reachable.
export const LIVE = {
  buyLabel: shippingLabels.buyLabel,
  authorize,
  confirm: (order_id: string) => emailService.sendOrderPlacedConfirmation(order_id),
};

// -------------------- the one door

export async function place(
  checkout_id: string, world: typeof LIVE = LIVE
): Promise<OrderView> {
  const checkout = await checkoutService.getRowById(checkout_id);
  rules.assertCheckout(checkout, checkout_id);
  // A VISITOR MAY SHOP AND MAY NOT BUY (ruling 63). The subject is the
  // CHECKOUT ROW's owner rather than the request's caller, because that is who
  // the order would belong to - an admin placing a customer's checkout is
  // asking about the customer. checkout/service.ts carries the reasoning.
  await checkoutService.assertRealAccount(checkout.user_id, "place an order");
  // THE ONE READINESS QUESTION: `missing` is the checkout's own list, already
  // narrowed to the chosen method's category.
  rules.assertPlaceable(await checkoutService.missingFor(checkout));
  const cart = await checkoutService.getItemsForOrder(checkout_id);

  const order_id =
    rules.directionOf(checkout) === "sale"
      ? await placeSale(checkout, cart, world)
      : await placePurchase(checkout, cart, world);

  const order = await orderRead.view(order_id);
  rules.assertPlacedOrder(order, order_id);
  return order;
}

// -------------------- the rows an order is

// ONE TRANSACTION, BOTH DIRECTIONS, and every statement is a copy. The lines
// are the caller's because they are the one thing the two directions write
// differently: a purchase copies the basket, a sale copies it joined to what
// the pricing decided.
async function writeOrder(
  { checkout, status, lines, cart }: {
    checkout: Checkout;
    status: string;
    lines: (order_id: string, tx: PoolClient) => Promise<OrderItem[]>;
    cart: OrderLine[];
  },
  tx: PoolClient
): Promise<string> {
  const order = await ordersRepo.createForCheckout(
    { checkout_id: checkout.id, status }, tx
  );
  rules.assertPlacedOrder(order, checkout.id);
  const order_id = order.id;

  const written = await lines(order_id, tx);
  rules.assertEveryLineCopied(written.length, cart.length, order_id);

  // A purchase's premiums are the rate bands', read at the order's own metal
  // totals; retierPremiums reads the direction and leaves a sale alone.
  await retierPremiums(order_id, tx);

  // THE SPOTS THE ORDER IS QUOTED AT, copied off the live feed. A metal with
  // no quote does not join, and the rule refuses the short answer.
  rules.assertEveryMetalQuoted(written, await orderSpots.freezeForOrder(order_id, tx));

  await snapshotAddress(order_id, checkout, tx);
  await fulfillmentService.attachForCheckout(order_id, checkout, tx);
  await refinerService.mirrorForOrder(order_id, tx);
  return order_id;
}

// THE CHECKOUT GOES BACK TO EMPTY, AND IT GOES LAST (D208): the choices are
// the ORDER's now. It is the caller's final statement rather than writeOrder's
// because every `INSERT … SELECT` above reads `checkout.checkouts` LIVE -
// clearing the row first would copy nulls into the totals' payout account and
// the parcel's box and service.
async function clearChoices(checkout: Checkout, tx: PoolClient): Promise<void> {
  await checkoutService.resetAfterOrder(
    checkout.user_id, rules.directionOf(checkout), tx
  );
}

// COPYING IS THE WHOLE POINT: editing a book entry afterwards must not rewrite
// where a parcel was sent, and deleting one must not take the record away.
async function snapshotAddress(
  order_id: string, checkout: Checkout, tx: PoolClient
): Promise<void> {
  const source_address_id =
    checkout.shipper_address_id ?? checkout.recipient_address_id ?? checkout.pickup_address_id;
  if (!source_address_id) return;
  const address_id = await addressService.snapshot(source_address_id, tx);
  if (!address_id) return;
  await orderAddresses.create({ order_id, address_id, source_address_id }, tx);
}

// -------------------- the purchase side: the business buys metal

// LOAD -> ASSERT -> WRITE -> AFTER (label-after-commit, 2026-09-03). The order
// and, when it ships, its parcel SHELL commit with every label column NULL;
// the label is bought only once that commit has happened, so a carrier failure
// leaves a real order behind - not a rolled-back one with a label FedEx has
// already billed for. Nothing here catches: a failure in the AFTER step
// propagates as this request's error, and POST /api/shipments/:id/label is the
// retry surface for the parcel it left behind.
async function placePurchase(
  checkout: Checkout, cart: OrderLine[], world: typeof LIVE
): Promise<string> {
  const draft = checkout.fulfillment_id
    ? rules.requireFreeFulfillmentDraft(
        await fulfillmentService.getById(checkout.fulfillment_id)
      )
    : null;
  const method = await checkoutService.chosenMethod(checkout);
  const ships = method?.category === "SHIPMENT";

  // THE PARCEL'S WEIGHT IS THE SERVER'S (ruling 58), and only a parcel has one.
  const weight = ships
    ? shippingRules.parcelWeightLb(cart, await packagesRepo.getOne(checkout.package_id!))
    : 0;

  const payout_fee = rules.payoutFeeOf(
    await paymentMethods.listFor("purchase"), checkout.payment_method_id
  );

  const placed = await withTransaction(async (tx) => {
    const order_id = await writeOrder(
      {
        checkout, cart, status: "In Transit",
        lines: (id, client) => orderItems.createBought(id, checkout.id, client),
      },
      tx
    );
    rules.assertTotalsWritten(
      await orderTransactions.createForCheckout(
        { order_id, checkout_id: checkout.id, payout_fee }, tx
      ),
      order_id
    );

    if (!ships) {
      await clearChoices(checkout, tx);
      return { order_id, shipment_id: null };
    }

    const shipment_id = await shippingLabels.createForCheckout(
      checkout, weight, method?.type ?? null, tx
    );
    if (draft) {
      await fulfillmentShipments.link(
        { fulfillment_id: draft.fulfillment.id, shipment_id }, tx
      );
    }
    await clearChoices(checkout, tx);
    return { order_id, shipment_id };
  });

  // OUTSIDE WORLD, AFTER: the order and its shell already exist.
  if (placed.shipment_id) {
    await world.buyLabel(
      placed.shipment_id,
      shippingRules.scheduleOf(checkout.pickup_date, checkout.pickup_time)
    );
  }

  await attempt("clear the purchase basket", () =>
    checkoutService.clearItems(checkout.user_id, "purchase")
  );
  await world.confirm(placed.order_id);
  return placed.order_id;
}

// -------------------- the sale side: the customer buys metal, so is charged

// CREATE-THEN-CHARGE: the order exists before money moves - the old ordering
// left a paid customer with no order (D179).
async function placeSale(
  checkout: Checkout, cart: OrderLine[], world: typeof LIVE
): Promise<string> {
  const address = rules.requireAddress(
    await placeAddresses.getOne(checkout.recipient_address_id!), "delivery"
  );
  const spots = await spotsService.getSpotPrices();
  const priced = await taxService.attachSalesTaxToItems(
    address.state,
    rules.saleLines(
      cart,
      await productService.getItemsFromServer(rules.catalogueWanted(cart)),
      new Map(spots.map((spot) => [spot.id, spot.name]))
    ),
    spots
  );
  const service = checkout.carrier_service_id
    ? await servicesRepo.getOne(checkout.carrier_service_id)
    : undefined;
  const method = (await paymentMethods.listFor("sale"))
    .find((m) => m.id === checkout.payment_method_id);

  // CREDIT IS THE SERVER'S FACT, NOT A CHECKBOX: the balance is a row this API
  // owns, and pricing caps what is applied at the order's own total.
  const balance = (await usersRepo.balanceForUpdate(checkout.user_id)) ?? 0;
  const prices = calculateSalesOrderTotal(
    priced, spots, { dorado_funds: balance }, service?.code, method?.type
  );
  const cents = rules.chargeCents(prices.post_charges_amount);
  const intent = cents > 0 ? await openIntentFor(checkout.user_id, cents) : null;

  const lines = rules.pricedSaleLines(cart, priced, (line) => calculateItemAsk(line, spots));

  const order_id = await withTransaction(async (tx) => {
    const id = await writeOrder(
      {
        checkout, cart,
        status: rules.statusAtPlacement(cents, intent?.settled === true),
        lines: (order, client) => orderItems.createSold(order, checkout.id, lines, client),
      },
      tx
    );
    // EVERY FIGURE IS THE PRICING SERVICE'S ANSWER, so this is the one create
    // with nothing to copy. The five renames are the table's own - see
    // db/orders/transactions/sql/create.sql.
    await orderTransactions.create(
      {
        order_id: id, total: prices.order_total, shipping: prices.shipping_charge,
        shipping_service: service?.name, funds: prices.pre_charges_amount,
        post_charges_amount: prices.post_charges_amount,
        subject_to_charges_amount: prices.subject_to_charges_amount,
        used_funds: prices.pre_charges_amount > 0, items: prices.item_total,
        base_total: prices.base_total, surcharge: prices.charges_amount,
        sales_tax: prices.sales_tax,
      },
      tx
    );

    if (prices.pre_charges_amount > 0) {
      // Credit is RESERVED at creation so the same dollars cannot be spent
      // twice; the abandonment sweep puts it back if payment never arrives.
      await usersService.removeFunds(checkout.user_id, prices.pre_charges_amount, tx);
      await transactionsService.addTransactionLog(
        {
          user_id: checkout.user_id, type: "Debit", order_id: id,
          amount: prices.pre_charges_amount,
        },
        tx
      );
    }
    await taxService.updateStateSalesTax(prices.sales_tax, address.state, tx);
    if (intent) await paymentsService.attachOrder(intent.payment_intent_id, id, tx);
    await clearChoices(checkout, tx);
    return id;
  });

  // OUTSIDE WORLD, AFTER: the order exists, so the card is set to exactly what
  // the server priced and the customer confirms that.
  if (intent && !intent.settled) await world.authorize(intent.payment_intent_id, cents);
  return order_id;
}

// THE CUSTOMER'S OWN OPEN INTENT, resolved server-side. The id used to arrive
// in the body, and whatever it named was attached on trust.
async function openIntentFor(
  user_id: string, cents: number
): Promise<{ payment_intent_id: string; settled: boolean }> {
  rules.assertAboveStripeMinimum(cents);
  const intent = await intentsRepo.findOpenForUser(user_id);
  rules.assertOpenIntent(intent);
  rules.assertIntentLive(intent.payment_status);

  const verdict = rules.attachmentVerdict(intent);
  rules.assertAttachable(verdict);
  const superseded = verdict === "supersede" ? intent.order_id : null;
  if (superseded) {
    // An abandoned checkout is SUPERSEDED, not refused: the intent is reused
    // until it settles, and refusing strands the customer paying.
    await withTransaction(async (tx) => {
      await sweeps.cancelPendingSale(superseded, tx);
      await paymentsService.attachOrder(intent.payment_intent_id, null, tx);
    });
  }

  if (!rules.isSettled(intent.payment_status)) {
    return { payment_intent_id: intent.payment_intent_id, settled: false };
  }
  // A settled, unattached intent is D179 wreckage arriving to be repaired: the
  // money is real, so the order is born paid IF the amount still matches.
  rules.assertRepairable(intent, cents);
  const settled = intent.payment_status === "succeeded";
  return { payment_intent_id: intent.payment_intent_id, settled };
}

// The server sets the authoritative amount, and records what Stripe answered.
async function authorize(payment_intent_id: string, cents: number): Promise<void> {
  const updated = await stripeProvider.updateIntent(payment_intent_id, { amount: cents });
  await withTransaction((tx) => paymentsService.updateFromProvider(updated, tx));
}
