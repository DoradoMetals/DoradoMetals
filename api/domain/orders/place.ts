// PLACING AN ORDER: one checkout id in (ruling 43), the order out. LOAD -> ASSERT -> OUTSIDE WORLD -> WRITE -> OUTSIDE WORLD (D214 item 11).
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
import * as pickupService from "#domain/shipping/pickups/service.ts";
import * as carrierServices from "#domain/shipping/services/service.ts";
import * as handoffsService from "#domain/shipping/handoffs/service.ts";
import * as shippingOperations from "#domain/shipping/operations/service.ts";
import * as shippingOps from "#domain/shipping/operations/handler.ts";
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
import { calculateSalesOrderTotal } from "#domain/pricing/ask.ts";
import { retierPremiums } from "#domain/orders/service.ts";

import withTransaction from "#shared/db/withTransaction.ts";
import { Conflict, Invalid, NotFound } from "#shared/errors.ts";
import type { NewOrderItem } from "#db/orders/items/repo.ts";
import type { NewOrderTotals } from "#db/orders/transactions/repo.ts";
import type { CheckoutRow } from "#db/checkout/checkouts/repo.ts";
import type { AddressRow } from "#db/places/addresses/repo.ts";
import type { SpotWire } from "#domain/spots/compose.ts";
import type { OrderView } from "@dorado/contracts";

// -------------------- the outside world

// What the carrier said, once. A stub answers the same shape with no tracking
// number, and voiding nothing is what voidLabel already does.
export type Postage = {
  netCharge: number;
  tracking_number: string | null;
  label: Buffer | null;
  pickup: { confirmationNumber: string | null; location: string | null } | null;
};

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

  // OUTSIDE WORLD, BEFORE: a label must exist before a row can record it.
  const postage = await world.buyPostage(shipper, customer?.name ?? "", parcel);

  const order_id = randomUUID();
  try {
    await withTransaction(async (tx) => {
      await writeOrder(
        {
          order_id, checkout, spots, status: "In Transit",
          lines: rules.linesBought(order_id, cart),
          totals: rules.totalsBought(order_id, checkout, parcel, postage.netCharge, payout_fee),
        },
        tx
      );
      const shipment_id = await newShipments.create(
        rules.shipmentFrom(checkout, parcel, postage), tx
      );
      await fulfillmentShipments.link({ fulfillment_id: draft.id, shipment_id }, tx);
      if (postage.pickup && parcel.schedule) {
        await pickupService.recordForShipment(
          {
            shipment_id, date: parcel.schedule.date, time: parcel.schedule.time,
            confirmation_number: postage.pickup.confirmationNumber,
            location: postage.pickup.location,
          },
          tx
        );
      }
    });
  } catch (err) {
    // The rows did not commit, so the label and the booking are undone. Neither
    // ever masks the original error - see shipping/operations/service.ts.
    await shippingOperations.voidPickup(
      postage.pickup && {
        confirmationNumber: postage.pickup.confirmationNumber,
        location: postage.pickup.location, pickupDate: parcel.schedule?.date,
      }
    );
    await shippingOperations.voidLabel(postage.tracking_number);
    throw err;
  }

  // Device-sync data: a failed clear is a stale basket, not lost data.
  await checkoutService.syncCart(checkout.user_id, "purchase", []).catch(() => {});
  await world.confirm(order_id);
  return order_id;
}

// THE CARRIER, ASKED IN ORDER: the postage price, the label that costs it, the
// courier if one is coming. A failed booking voids the label - it is billed.
async function buyPostage(
  shipper: AddressRow, personName: string, parcel: rules.Parcel
): Promise<Postage> {
  const netCharge = rules.quotedCharge(
    await shippingOperations.getRates(rules.rateRequest(shipper, parcel)), parcel.serviceType
  );
  const labelData = await shippingOps.createLabel(
    parcel.carrier_id, undefined, rules.labelRequest(shipper, personName, parcel)
  );
  const label = await shippingOperations.labelBufferOrVoid(labelData);
  const tracking_number = labelData.tracking_number;
  if (!parcel.schedule) return { netCharge, tracking_number, label, pickup: null };

  try {
    const pickup = await shippingOps.createPickup(
      parcel.carrier_id, undefined,
      rules.pickupRequest(shipper, personName, parcel, parcel.schedule, tracking_number)
    );
    return { netCharge, tracking_number, label, pickup };
  } catch (err) {
    await shippingOperations.voidLabel(tracking_number);
    throw err;
  }
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
  const catalogue = await taxService.attachSalesTaxToItems(
    address.state, await productService.getItemsFromServer(rules.catalogueWanted(cart)), spots
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
    catalogue, balance > 0, spots, { dorado_funds: balance }, service?.code, method?.type
  );
  const cents = rules.chargeCents(prices.post_charges_amount);
  const intent = cents > 0 ? await openIntentFor(checkout.user_id, cents) : null;

  const order_id = randomUUID();
  await withTransaction(async (tx) => {
    await writeOrder(
      {
        order_id, checkout, spots,
        status: rules.statusAtPlacement(cents, intent?.settled === true),
        lines: rules.linesSold(order_id, cart, catalogue, spots),
        totals: rules.totalsSold(order_id, prices, service?.name),
      },
      tx
    );
    if (prices.pre_charges_amount > 0) {
      // Credit is RESERVED at creation so the same dollars cannot be spent
      // twice; the abandonment sweep puts it back if payment never arrives.
      await usersService.removeFunds(checkout.user_id, prices.pre_charges_amount, tx);
      await transactionsService.addTransactionLog(
        checkout.user_id, "Debit", null, order_id, prices.pre_charges_amount, tx
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
  const superseded = verdict === "supersede" ? intent.sales_order_id : null;
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
