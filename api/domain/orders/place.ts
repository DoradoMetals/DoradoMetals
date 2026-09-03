// PLACING AN ORDER: one checkout id in (ruling 43), the order out. LOAD -> ASSERT -> WRITE -> OUTSIDE WORLD (D214 item 11; the purchase side moved its postage purchase from BEFORE the write to AFTER on 2026-09-03 - label-after-commit).
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import * as ordersRepo from "#db/orders/repo.ts";
import * as orderItems from "#db/orders/items/repo.ts";
import * as orderSpots from "#db/orders/spots/repo.ts";
import * as orderAddresses from "#db/orders/addresses/repo.ts";
import * as orderTransactions from "#db/orders/transactions/repo.ts";
import * as newShipments from "#db/shipping/shipments/repo.ts";
import * as packagesRepo from "#db/shipping/packages/repo.ts";
import * as servicesRepo from "#db/shipping/services/repo.ts";
import * as paymentMethods from "#db/payments/methods/repo.ts";
import * as intentsRepo from "#db/payments/intents/repo.ts";
import * as placeAddresses from "#db/places/addresses/repo.ts";
import * as usersRepo from "#db/users/repo.ts";

import * as addressService from "#domain/places/addresses/service.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
import * as fulfillmentShipments from "#domain/fulfillments/shipments/service.ts";
import * as carrierServices from "#domain/shipping/services/service.ts";
import * as handoffsService from "#domain/shipping/handoffs/service.ts";
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
import { buyPostage, recordPostage } from "#domain/orders/postage.ts";
import { calculateSalesOrderTotal } from "#domain/pricing/ask.ts";
import { retierPremiums } from "#domain/orders/service.ts";

import withTransaction from "#shared/db/withTransaction.ts";
import { attempt } from "#shared/attempt.ts";
import { Conflict, Invalid, NotFound } from "#shared/errors.ts";
import type { NewOrderItem } from "#db/orders/items/repo.ts";
import type { NewOrderTotals } from "#db/orders/transactions/repo.ts";
import type { CheckoutRow } from "#db/checkout/checkouts/repo.ts";
import type { AddressRow } from "#db/places/addresses/repo.ts";
import type { SpotWire } from "#domain/spots/compose.ts";
import type { OrderView } from "@dorado/contracts";
import type { Postage } from "#domain/orders/postage.ts";

export type { Postage } from "#domain/orders/postage.ts";

// -------------------- the outside world

// THE THREE CALLS A PLACEMENT CANNOT ROLL BACK, injected as sendToRefiner's
// transport is: a test drives the real row flow with no provider reachable.
export type World = {
  buyPostage: (shipper: AddressRow, personName: string, parcel: rules.Parcel) => Promise<Postage>;
  authorize: (payment_intent_id: string, cents: number) => Promise<void>;
  confirm: (order_id: string) => Promise<void>;
};

export const LIVE: World = {
  buyPostage,
  authorize,
  confirm: (order_id) => emailService.sendOrderPlacedConfirmation(order_id),
};

// -------------------- the one door

export async function place(checkout_id: string, world: World = LIVE): Promise<OrderView> {
  const checkout = await checkoutService.getRowById(checkout_id);
  if (!checkout) throw new NotFound(`no checkout ${checkout_id}`);
  const cart = await checkoutService.getItemsForOrder(checkout_id);

  const order_id =
    rules.directionOf(checkout) === "sale"
      ? await placeSale(checkout, cart, world)
      : await placePurchase(checkout, cart, world);

  const order = await orderRead.view(order_id);
  if (!order) throw new Error(`order ${order_id} was placed and cannot be read back`);
  return order;
}

// -------------------- the rows an order is

// One transaction, both directions. Every derivation arrives complete; nothing
// here computes.
async function writeOrder(
  { order_id, checkout, status, lines, totals, spots }: {
    order_id: string; checkout: CheckoutRow; status: string;
    lines: NewOrderItem[]; totals: NewOrderTotals; spots: SpotWire[];
  },
  tx: PoolClient
): Promise<void> {
  await ordersRepo.create(rules.orderFrom(order_id, checkout, status), tx);
  await orderItems.createMany(lines, tx);
  // A purchase's premiums are the rate bands', read at the order's own metal
  // totals; retierPremiums reads the direction and leaves a sale alone.
  await retierPremiums(order_id, tx);
  await orderSpots.createMany(rules.spotsToFreeze(order_id, lines, spots), tx);
  await orderTransactions.create(totals, tx);
  await snapshotAddress(order_id, checkout, tx);
  await fulfillmentService.attachForCheckout(rules.handoverOf(order_id, checkout), tx);
  await refinerService.mirrorForOrder(order_id, tx);
  await checkoutService.resetAfterOrder(checkout.user_id, rules.directionOf(checkout), tx);
}

// COPYING IS THE WHOLE POINT: editing a book entry afterwards must not rewrite
// where a parcel was sent, and deleting one must not take the record away.
async function snapshotAddress(
  order_id: string, checkout: CheckoutRow, tx: PoolClient
): Promise<void> {
  const source_address_id =
    checkout.shipper_address_id ?? checkout.recipient_address_id ?? checkout.pickup_address_id;
  if (!source_address_id) return;
  const address_id = await addressService.snapshot(source_address_id, tx);
  if (!address_id) return;
  await orderAddresses.create({ order_id, address_id, source_address_id }, tx);
}

// -------------------- the purchase side: the business buys metal, so it buys the postage

// LOAD -> ASSERT -> WRITE -> AFTER (label-after-commit, 2026-09-03). The order
// and its shipment SHELL commit with every label column NULL; the label is
// bought only once that commit has happened, so a carrier failure leaves a
// real order behind - not a rolled-back one with a label FedEx has already
// billed for. Nothing here catches: a failure in the AFTER step propagates as
// this request's error, and orders.buyLabel (POST /api/orders/:id/label) is
// the retry surface for the shipment it left behind.
async function placePurchase(
  checkout: CheckoutRow, cart: rules.CheckoutLine[], world: World
): Promise<string> {
  const placeable = rules.assertPlaceableAsPurchase(checkout, cart);
  const draft = rules.requireFreeShipmentDraft(
    await fulfillmentService.getById(placeable.fulfillment_id)
  );
  const service = await carrierServices.labelServiceFor(placeable.carrier_service_id);
  const parcel = rules.parcelFor(
    checkout, placeable, service,
    await packagesRepo.getOne(placeable.package_id),
    rules.handoffFor(await handoffsService.getHandoffs(), draft.method.type),
    await carrierServices.clampInsuredValue(checkout.declared_value, service.serviceType)
  );
  const shipper = rules.requireAddress(
    await placeAddresses.getOne(placeable.shipper_address_id), "shipper"
  );
  const customer = await usersRepo.getOne(checkout.user_id);
  const payout_fee = rules.payoutFeeOf(
    await paymentMethods.listFor("purchase"), checkout.payment_method_id
  );
  const spots = await spotsService.getSpotPrices();

  const order_id = randomUUID();
  const shipment_id = await withTransaction(async (tx) => {
    await writeOrder(
      {
        order_id, checkout, spots, status: "In Transit",
        lines: rules.linesBought(order_id, cart),
        totals: rules.totalsBought(order_id, checkout, parcel, payout_fee),
      },
      tx
    );
    const id = await newShipments.create(rules.shipmentFrom(checkout, parcel), tx);
    await fulfillmentShipments.link({ fulfillment_id: draft.id, shipment_id: id }, tx);
    return id;
  });

  // OUTSIDE WORLD, AFTER: the order and its shell shipment already exist.
  const postage = await world.buyPostage(shipper, customer?.name ?? "", parcel);
  await recordPostage(order_id, shipment_id, postage, parcel.schedule);

  await attempt("clear the purchase basket", () =>
    checkoutService.clearItems(checkout.user_id, "purchase")
  );
  await world.confirm(order_id);
  return order_id;
}

// -------------------- the sale side: the customer buys metal, so is charged

// CREATE-THEN-CHARGE: the order exists before money moves - the old ordering
// left a paid customer with no order (D179).
async function placeSale(
  checkout: CheckoutRow, cart: rules.CheckoutLine[], world: World
): Promise<string> {
  const placeable = rules.assertPlaceableAsSale(checkout, cart);
  const address = rules.requireAddress(
    await placeAddresses.getOne(placeable.recipient_address_id), "delivery"
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

  const order_id = randomUUID();
  await withTransaction(async (tx) => {
    await writeOrder(
      {
        order_id, checkout, spots,
        status: rules.statusAtPlacement(cents, intent?.settled === true),
        lines: rules.linesSold(order_id, cart, priced, spots),
        totals: rules.totalsSold(order_id, prices, service?.name),
      },
      tx
    );
    if (prices.pre_charges_amount > 0) {
      // Credit is RESERVED at creation so the same dollars cannot be spent
      // twice; the abandonment sweep puts it back if payment never arrives.
      await usersService.removeFunds(checkout.user_id, prices.pre_charges_amount, tx);
      await transactionsService.addTransactionLog(
        { user_id: checkout.user_id, type: "Debit", order_id, amount: prices.pre_charges_amount }, tx
      );
    }
    await taxService.updateStateSalesTax(prices.sales_tax, address.state, tx);
    if (intent) await paymentsService.attachOrder(intent.payment_intent_id, order_id, tx);
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
  if (rules.belowStripeMinimum(cents)) {
    throw new Invalid("the amount left to charge is below Stripe's $0.50 minimum");
  }
  const intent = await intentsRepo.findOpenForUser(user_id);
  if (!intent) {
    throw new Invalid(
      "this order has a card charge and the customer has no open payment intent"
    );
  }
  if (intent.payment_status === "canceled") {
    throw new Conflict("that payment intent was cancelled - start checkout again");
  }

  const verdict = rules.attachmentVerdict(intent);
  if (verdict === "conflict") {
    throw new Conflict("that payment intent already belongs to an order");
  }
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
  if (!rules.repairAmountMatches(intent.amount, cents)) {
    throw new Conflict(
      `payment ${intent.payment_intent_id} was taken at a different price than this ` +
        `order totals now - contact support with that reference`
    );
  }
  const settled = intent.payment_status === "succeeded";
  return { payment_intent_id: intent.payment_intent_id, settled };
}

// The server sets the authoritative amount, and records what Stripe answered.
async function authorize(payment_intent_id: string, cents: number): Promise<void> {
  await paymentsService.updateFromProvider(
    await stripeProvider.updateIntent(payment_intent_id, { amount: cents })
  );
}
