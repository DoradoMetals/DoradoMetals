// PLACING AN ORDER. One use case, one input: the id of the checkout the
// customer filled in.
//
//   place(checkout_id) -> the order, as OrderView
//
// THE CLIENT SENDS ONE ID (ruling 43). The purchase door has been a zero-body
// create since D210; the sale door used to take the browser's whole checkout
// document - the address book row, the cart lines, the delivery service, the
// payment method, a credit checkbox and a `spot_prices` field declared only so
// it could be ignored. Every one of those is a column of checkout.checkouts or
// a row of checkout.items, and the CUSTOMER is the checkout row's own user_id,
// so the admin door and the customer door take the same body.
//
// LOAD -> ASSERT -> OUTSIDE WORLD -> WRITE (D214 item 11). The outside-world
// step is the one thing that cannot be rolled back, so it happens between the
// reads and the transaction, and each of its steps is undone if the next
// fails: a purchase buys a label and books a pickup, a sale authorises a card.
// Everything else is one transaction.
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";

import * as ordersRepo from "#db/orders/repo.ts";
import * as orderItems from "#db/orders/items/repo.ts";
import * as orderSpots from "#db/orders/spots/repo.ts";
import * as orderAddresses from "#db/orders/addresses/repo.ts";
import * as orderTransactions from "#db/orders/transactions/repo.ts";
import * as refinerOrders from "#db/refiners/orders/repo.ts";
import * as refinerItems from "#db/refiners/items/repo.ts";
import * as refinerSpots from "#db/refiners/spots/repo.ts";
import * as newShipments from "#db/shipping/shipments/repo.ts";
import * as packagesRepo from "#db/shipping/packages/repo.ts";
import * as servicesRepo from "#db/shipping/services/repo.ts";
import * as paymentMethods from "#db/payments/methods/repo.ts";
import * as intentsRepo from "#db/payments/intents/repo.ts";
import * as usersRepo from "#db/users/repo.ts";

import * as addressService from "#domain/places/addresses/service.ts";
import * as placeAddresses from "#db/places/addresses/repo.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
// The two bookings are their own resources (ruling 26b): checkout reaches
// fulfillments/pickups and fulfillments/directs directly.
import * as fulfillmentPickups from "#domain/fulfillments/pickups/service.ts";
import * as fulfillmentDirects from "#domain/fulfillments/directs/service.ts";
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
import * as sweeps from "#domain/payments/sweeps.ts";
import * as stripeProvider from "#providers/payment/stripe.ts";
import * as orderRead from "#domain/orders/read.ts";
import { calculateItemAsk, calculateSalesOrderTotal } from "#domain/pricing/service.ts";
import * as rules from "#domain/orders/rules.ts";
import { retierPremiums } from "#domain/orders/service.ts";

import withTransaction from "#shared/db/withTransaction.ts";
import { Conflict, Invalid, NotFound } from "#shared/errors.ts";
import { DORADO_CONTACT, FEDEX_STORE_ADDRESS } from "#providers/shipments/constants.ts";
import type { CheckoutRow } from "#db/checkout/checkouts/repo.ts";
import type { OrderView } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

// ===========================================================================
// THE SHARED CORE: a checkout becomes an order
// ===========================================================================

// A line whose metal cannot be resolved is REFUSED, never skipped: an order
// silently missing a line means the customer's metal arrives unrecorded.
async function copyLines(order_id: string, checkout_id: string, tx: PoolClient) {
  const lines = await checkoutService.getItemsForOrder(checkout_id, tx);
  if (!lines.length) throw new Invalid("a checkout with no items cannot become an order");

  const rows = lines.map((line) => {
    if (!line.metal_id) {
      throw new Invalid(
        `checkout item ${line.id} has no metal, and neither does the product it ` +
          `names - orders.items.metal_id is NOT NULL, so this order cannot be placed`
      );
    }
    return {
      order_id,
      bullion_id: line.bullion_id,
      metal_id: line.metal_id,
      pre_melt: line.pre_melt,
      post_melt: line.post_melt,
      purity: line.purity,
      content: line.content,
      premium: line.premium,
      quantity: line.quantity ?? 1,
      unit: line.unit,
    };
  });
  await orderItems.createMany(rows, tx);
}

// COPYING IS THE WHOLE POINT: editing a book entry afterwards must not rewrite
// where a parcel was sent, and deleting one must not take the record away.
async function snapshotAddress(
  order_id: string, source_address_id: string | null, tx: PoolClient
): Promise<string | null> {
  if (!source_address_id) return null;
  const snapshot_id = await addressService.snapshot(source_address_id, tx);
  if (!snapshot_id) return null;
  await orderAddresses.create({ order_id, address_id: snapshot_id, source_address_id }, tx);
  return snapshot_id;
}

// `status` is the caller's: what an order starts as differs by direction and by
// how it was placed.
//
// EXPORTED AS A SEAM, not as a second door: it is the half of a placement that
// writes rows, so the row flow can be asserted without a carrier or a card
// being reachable. Nothing outside this file and its tests calls it.
export async function createFromCheckout(
  checkout: CheckoutRow, status: string, tx: PoolClient
): Promise<{ order_id: string; number: number; fulfillment_id: string }> {
  const direction = checkout.direction === "sale" ? "sale" : "purchase";
  const { id: order_id, number } = await ordersRepo.create(
    { user_id: checkout.user_id, direction, status }, tx
  );

  // ONE ENGAGEMENT PER ORDER, EVERY ORDER (093), values NULL until a refinery
  // is involved.
  await refinerOrders.ensureForOrder(order_id, tx);

  await copyLines(order_id, checkout.id, tx);
  // EVERY purchase line is repriced from the rates table here, bullion
  // included: the premium the cart carried is a display figure and the tier is
  // the price fact. A sale is left alone - retierPremiums checks the direction.
  await retierPremiums(order_id, tx);
  await orderSpots.createMany(
    rules.spotsToFreeze(
      order_id, await orderItems.getFor(order_id, tx), await spotsService.getSpotPrices(tx)
    ),
    tx
  );

  // The refiner counterparts: one per customer line, one per frozen spot.
  await refinerItems.mirrorLinesForOrder(order_id, tx);
  await refinerSpots.coverFromOrderSpots(order_id, tx);

  // A purchase records a shipper, a sale a recipient, a pickup a pickup
  // address; only one is ever set.
  await snapshotAddress(
    order_id,
    checkout.shipper_address_id ?? checkout.recipient_address_id ?? checkout.pickup_address_id,
    tx
  );

  // The draft the checkout mutated is ATTACHED (D208), falling back to the
  // method column and then the default. All three go through the service so its
  // checks apply.
  const fulfillment = checkout.fulfillment_id
    ? await fulfillmentService.attachDraft(
        { fulfillment_id: checkout.fulfillment_id, order_id }, tx
      )
    : checkout.fulfillment_method_id
      ? await fulfillmentService.chooseById(
          { order_id, method_id: checkout.fulfillment_method_id }, tx
        )
      : await fulfillmentService.chooseDefault(
          { order_id, direction, category: "SHIPMENT" }, tx
        );

  // Not reachable today; kept because a TypeError here would roll the order
  // back with a message that says nothing about an order.
  if (!fulfillment) {
    throw new Error(
      `order ${order_id} was created from checkout ${checkout.id} but no ` +
        `fulfillment came back for it - the order cannot be handed over and ` +
        `this transaction must not commit`
    );
  }

  if (fulfillment.method.category === "PICKUP" && checkout.pickup_address_id) {
    await fulfillmentPickups.schedule(
      {
        fulfillment_id: fulfillment.id,
        pickup_address_id: checkout.pickup_address_id,
        start_time: checkout.appointment_time,
      },
      tx
    );
  }

  if (fulfillment.method.category === "DIRECT" && checkout.appointment_location_id) {
    await fulfillmentDirects.schedule(
      {
        fulfillment_id: fulfillment.id,
        location_id: checkout.appointment_location_id,
        is_appointment: fulfillment.method.type === "APPOINTMENT",
        start_time: checkout.appointment_time,
      },
      tx
    );
  }

  return { order_id, number, fulfillment_id: fulfillment.id };
}

// ===========================================================================
// THE ONE DOOR
// ===========================================================================

export async function place(checkout_id: string): Promise<OrderView> {
  const checkout = await checkoutService.getRowById(checkout_id);
  if (!checkout) throw new NotFound(`no checkout ${checkout_id}`);

  const order_id =
    checkout.direction === "purchase"
      ? await placePurchase(checkout)
      : await placeSale(checkout);

  const order = await orderRead.view(order_id);
  if (!order) throw new Error(`order ${order_id} was placed and cannot be read back`);
  return order;
}

// ===========================================================================
// THE PURCHASE SIDE: the business buys metal, so it buys the postage
// ===========================================================================

// Everything the label step needs, resolved from ids the checkout already
// holds. An internal computation shape: it exists so the outside-world calls
// and the transaction read the same resolved values, once.
type Parcel = {
  carrier_id: string;
  serviceType: string;
  carrierCode: string;
  handoff: { code: string; name: string };
  weight: { units: string; value: number };
  dimensions: { length: number; width: number; height: number; units: string };
  declaredValue: number;
  schedule: { date: string; time: string } | null;
};

export type PlannedPurchase = {
  checkout: CheckoutRow;
  /** The customer's own address row - where the parcel is collected from. */
  shipper: NonNullable<Awaited<ReturnType<typeof placeAddresses.getOne>>>;
  /** Who signs for it. auth.users' name; the address book has no recipient. */
  customerName: string;
  parcel: Parcel;
  /** The payment method's own flat fee - server money, never a client's. */
  payoutFee: number;
};

// LOAD AND ASSERT, and nothing else: no provider call is reachable from here,
// which is what makes the whole resolution testable. Every value comes from a
// row the checkout already names by id.
export async function resolvePurchase(checkout: CheckoutRow): Promise<PlannedPurchase> {
  rules.assertShippingCheckoutComplete(checkout);

  const draft = await fulfillmentService.getById(checkout.fulfillment_id!);
  if (!draft) throw new Invalid("the checkout names a fulfillment that does not exist");
  if (draft.order_id) {
    throw new Conflict(
      "the checkout's fulfillment already belongs to an order - refresh and start again"
    );
  }
  if (draft.method.category !== "SHIPMENT") {
    throw new Invalid(
      `a ${draft.method.category} fulfillment cannot be placed through the shipping ` +
        `checkout yet - choose a shipping handoff`
    );
  }

  const wantsPickup = draft.method.type === "CARRIER PICKUP";
  if (wantsPickup) rules.assertPickupScheduled(checkout);

  const shipper = await placeAddresses.getOne(checkout.shipper_address_id!);
  if (!shipper) throw new Invalid("the checkout's shipper address does not exist");

  const box = await packagesRepo.getOne(checkout.package_id!);
  if (!box) throw new Invalid("the checkout names a package that does not exist");

  // WHICH CARRIER, WHICH SERVICE TYPE - shipping's question, asked of shipping.
  const service = await carrierServices.labelServiceFor(checkout.carrier_service_id!);

  // The handoff is chosen by CAPABILITY - the schedulable one is the pickup.
  // No carrier enum is ever spelled here.
  const handoffs = await handoffsService.getHandoffs();
  const handoff = handoffs.find((h) => h.requires_schedule === wantsPickup);
  if (!handoff) throw new Error("the carrier's handoff catalogue is missing an option");

  const methods = await paymentMethods.listFor("purchase");
  const customer = await usersRepo.getOne(checkout.user_id);

  return {
    checkout,
    shipper,
    customerName: customer?.name ?? "",
    payoutFee: Number(
      methods.find((m) => m.id === checkout.payment_method_id)?.flat_fee ?? 0
    ),
    parcel: {
      carrier_id: service.carrier_id,
      serviceType: service.serviceType,
      carrierCode: service.carrierCode,
      handoff: { code: handoff.code, name: handoff.name },
      weight: { units: "LB", value: Number(checkout.package_weight) },
      dimensions: {
        length: Number(box.length), width: Number(box.width),
        height: Number(box.height), units: "IN",
      },
      // The insured amount is clamped BEFORE anything reads it (D132).
      declaredValue: await carrierServices.clampInsuredValue(
        Number(checkout.declared_value ?? 0), service.serviceType
      ),
      schedule: wantsPickup
        ? { date: checkout.pickup_date!, time: checkout.pickup_time! }
        : null,
    },
  };
}

// THE WRITE HALF, its own function so the rows can be asserted with no provider
// call reachable. Every id comes off the checkout row the plan carries.
export async function recordPurchase(
  tx: PoolClient,
  { planned, netCharge, label = null, pickup = null }: {
    planned: PlannedPurchase;
    netCharge: number | null;
    label?: { tracking_number?: string | null; bytes?: string | Buffer | null } | null;
    pickup?: { confirmationNumber?: string | null; location?: string | null } | null;
  }
): Promise<{ order_id: string; shipment_id: string }> {
  const { checkout, parcel } = planned;
  const placed = await createFromCheckout(checkout, "In Transit", tx);

  await orderTransactions.create(
    {
      order_id: placed.order_id,
      shipping: netCharge,
      shipping_service: parcel.serviceType,
      used_funds: false,
    },
    tx
  );
  const payoutRecorded = await orderTransactions.update(
    placed.order_id,
    { payout_details_id: checkout.payment_details_id, payout_fee: planned.payoutFee },
    {},
    tx
  );
  if (!payoutRecorded) {
    throw new Error(
      `order ${placed.order_id}: the payout account and fee were not recorded - ` +
        `this transaction must not commit`
    );
  }

  // Written once with everything known - ids straight off the checkout row.
  const shipment_id = await newShipments.create(
    { id: randomUUID(), direction: "Inbound" }, tx
  );
  const recorded = await newShipments.update(
    shipment_id,
    {
      tracking_number: label?.tracking_number ?? null,
      shipping_status: "Label Created",
      label: label?.bytes ?? null,
      label_type: "Generated",
      pickup_type: parcel.handoff.name,
      package_id: checkout.package_id,
      carrier_service_id: checkout.carrier_service_id,
      cost: netCharge,
      insured: parcel.declaredValue > 0,
      declared_value: parcel.declaredValue > 0 ? parcel.declaredValue : null,
      direction: "Inbound",
    },
    tx
  );
  if (!recorded) {
    throw new Error(
      `order ${placed.order_id}: shipment ${shipment_id} vanished mid-placement - ` +
        `the label was not recorded and this transaction must not commit`
    );
  }
  await fulfillmentShipments.link(
    { fulfillment_id: placed.fulfillment_id, shipment_id }, tx
  );

  if (pickup && parcel.schedule) {
    await pickupService.recordForShipment(
      {
        shipment_id,
        date: parcel.schedule.date,
        time: parcel.schedule.time,
        confirmation_number: pickup.confirmationNumber,
        location: pickup.location,
      },
      tx
    );
  }

  await checkoutService.resetAfterOrder(checkout.user_id, "purchase", tx);
  return { order_id: placed.order_id, shipment_id };
}

async function placePurchase(checkout: CheckoutRow): Promise<string> {
  const planned = await resolvePurchase(checkout);
  const { parcel, shipper } = planned;

  // POSTAGE IS THE SERVER'S PRICE, rated right before the label it pays for.
  const rates = await shippingOperations.getRates({
    shippingType: "Inbound",
    address: shipper,
    pkg: { weight: parcel.weight, dimensions: parcel.dimensions },
    pickupType: parcel.handoff.code,
    declaredValue:
      parcel.declaredValue > 0
        ? { amount: parcel.declaredValue, currency: "USD" }
        : undefined,
  });
  const rate = (rates as { serviceType?: string; netCharge?: number }[]).find(
    (r) => r.serviceType === parcel.serviceType
  );
  if (!rate || rate.netCharge == null) {
    throw new Invalid(
      `the carrier quoted no rate for ${parcel.serviceType} - try a different service`
    );
  }

  // Outside-world work first, each step undone if the next fails: a label must
  // exist before the row can record it, so the compensation is voiding it.
  const labelData = await shippingOps.createLabel(parcel.carrier_id, undefined, {
    shipper: {
      contact: {
        personName: planned.customerName,
        phoneNumber: shipper.phone_number ?? "",
      },
      address: shipper,
    },
    recipient: { contact: DORADO_CONTACT, address: FEDEX_STORE_ADDRESS },
    serviceType: parcel.serviceType,
    pickupType: parcel.handoff.code,
    pkg: { weight: parcel.weight, dimensions: parcel.dimensions },
    insurance: { declaredValue: { amount: parcel.declaredValue, currency: "USD" } },
  });
  const bytes = await shippingOperations.labelBufferOrVoid(labelData);

  let pickup: { confirmationNumber?: string | null; location?: string | null } | null = null;
  if (parcel.schedule) {
    try {
      pickup = await shippingOps.createPickup(parcel.carrier_id, undefined, {
        pickupContact: {
          personName: planned.customerName,
          phoneNumber: shipper.phone_number ?? "",
        },
        pickupAddress: shipper,
        pickupDate: parcel.schedule.date,
        pickupTime: parcel.schedule.time,
        carrierCode: parcel.carrierCode,
        trackingNumber: labelData.tracking_number,
      });
    } catch (err) {
      await shippingOperations.voidLabel(labelData.tracking_number);
      throw err;
    }
  }

  // THE TRANSACTION, AND NOTHING ELSE INSIDE ITS COMPENSATION. If the rows do
  // not commit, the label and the booking are undone; if they do, the outside
  // world is told - after the commit, never inside it, which is the rule
  // shared/db/tests/transaction-side-effects.test.ts fails the build over.
  let order_id: string;
  try {
    ({ order_id } = await withTransaction((tx) =>
      recordPurchase(tx, {
        planned,
        netCharge: rate.netCharge!,
        label: { tracking_number: labelData.tracking_number, bytes },
        pickup,
      })
    ));
  } catch (err) {
    await shippingOperations.voidPickup(
      pickup && {
        confirmationNumber: pickup.confirmationNumber,
        location: pickup.location,
        pickupDate: parcel.schedule?.date ?? null,
      }
    );
    await shippingOperations.voidLabel(labelData.tracking_number);
    throw err;
  }

  // Device-sync data: a failed clear is a stale basket, not lost data.
  await checkoutService.syncCart(checkout.user_id, "purchase", []).catch(() => {});
  await emailService.sendOrderPlacedConfirmation(order_id);
  return order_id;
}

// ===========================================================================
// THE SALE SIDE: the customer buys metal, so the customer is charged
// ===========================================================================
//
// CREATE-THEN-CHARGE: the order exists before any money moves. The old
// ordering left a paid customer with no order when the second half failed
// (D179).
//
// SPOT PRICES COME FROM THE SERVER, NOT THE BODY. A body-supplied ask of 1 once
// recorded $26.81 for an ounce of gold and the payment intent agreed with it.
async function placeSale(checkout: CheckoutRow): Promise<string> {
  if (!checkout.recipient_address_id) {
    throw new Invalid("the checkout names no delivery address");
  }
  const address = await placeAddresses.getOne(checkout.recipient_address_id);
  if (!address) throw new Invalid("the checkout's delivery address does not exist");

  const lines = await checkoutService.getItemsForOrder(checkout.id);
  if (!lines.length) throw new Invalid("a checkout with no items cannot become an order");

  const catalogue = await productService.getItemsFromServer(
    lines.flatMap((line) =>
      line.bullion_id === null ? [] : [{ id: line.bullion_id, quantity: line.quantity ?? 0 }]
    )
  );
  const spot_prices = await spotsService.getSpotPrices();
  const items = await taxService.attachSalesTaxToItems(address.state, catalogue, spot_prices);

  // THE DELIVERY SERVICE AND THE PAYMENT METHOD ARE ROWS the checkout names by
  // id. `code` prices the delivery; `type` decides the card surcharge.
  const service = checkout.carrier_service_id
    ? await servicesRepo.getOne(checkout.carrier_service_id)
    : undefined;
  const methods = await paymentMethods.listFor("sale");
  const method = methods.find((m) => m.id === checkout.payment_method_id);

  // CREDIT IS THE SERVER'S FACT, NOT A CHECKBOX. `using_funds` used to arrive
  // in the body; a customer's balance is a row this API owns, and the pricing
  // already caps what is applied at the order's own total.
  const balance = (await usersRepo.balanceForUpdate(checkout.user_id)) ?? 0;
  const prices = calculateSalesOrderTotal(
    items, balance > 0, spot_prices, { dorado_funds: balance }, service?.code, method?.type
  );
  const cents = rules.chargeCents(prices.post_charges_amount);

  // THE INTENT IS RESOLVED SERVER-SIDE, where it used to be named by the body:
  // the old code attached whatever id arrived, whosever it was.
  let alreadySucceeded = false;
  let payment_intent_id: string | null = null;
  if (cents > 0) {
    if (rules.belowStripeMinimum(cents)) {
      throw new Invalid("the amount left to charge is below Stripe's $0.50 minimum");
    }
    const intent = await intentsRepo.findOpenForUser(checkout.user_id);
    if (!intent) {
      throw new Invalid(
        "this order has a card charge and the customer has no open payment intent"
      );
    }
    if (intent.payment_status === "canceled") {
      throw new Conflict("that payment intent was cancelled - start checkout again");
    }
    payment_intent_id = intent.payment_intent_id;

    switch (rules.attachmentVerdict(intent)) {
      case "conflict":
        throw new Conflict("that payment intent already belongs to an order");
      case "supersede":
        // An abandoned checkout is SUPERSEDED, not refused: the intent is
        // reused until it settles, and refusing strands the customer paying.
        await withTransaction(async (tx) => {
          await sweeps.cancelPendingSale(intent.sales_order_id as string, tx);
          await paymentsService.attachOrder(payment_intent_id!, null, tx);
        });
        break;
      default:
        break;
    }

    if (rules.isSettled(intent.payment_status)) {
      // A settled, unattached intent is D179 wreckage arriving to be repaired:
      // the money is real, so the order is born paid IF the amount still matches.
      if (!rules.repairAmountMatches(intent.amount, cents)) {
        throw new Conflict(
          `payment ${payment_intent_id} was taken at a different price than this ` +
            `order totals now - contact support with that reference`
        );
      }
      alreadySucceeded = intent.payment_status === "succeeded";
    } else {
      // The server sets the authoritative amount NOW - outside the transaction,
      // because a Stripe call cannot be rolled back - so the customer confirms
      // exactly what the server priced.
      await paymentsService.updateFromProvider(
        await stripeProvider.updateIntent(payment_intent_id, { amount: cents })
      );
    }
  }

  return await withTransaction(async (tx) => {
    const placed = await createFromCheckout(
      checkout, rules.statusAtPlacement(cents, alreadySucceeded), tx
    );

    await orderTransactions.create(
      {
        order_id: placed.order_id,
        total: prices.order_total,
        shipping: prices.shipping_charge,
        shipping_service: service?.name,
        funds: prices.pre_charges_amount,
        post_charges_amount: prices.post_charges_amount,
        subject_to_charges_amount: prices.subject_to_charges_amount,
        used_funds: prices.pre_charges_amount > 0,
        items: prices.item_total,
        base_total: prices.base_total,
        surcharge: prices.charges_amount,
        sales_tax: prices.sales_tax,
      },
      tx
    );

    if (prices.pre_charges_amount > 0) {
      // Credit is RESERVED at creation so the same dollars cannot be spent
      // twice; the abandonment sweep puts it back if payment never arrives.
      await usersService.removeFunds(checkout.user_id, prices.pre_charges_amount, tx);
      await transactionsService.addTransactionLog(
        checkout.user_id, "Debit", null, placed.order_id, prices.pre_charges_amount, tx
      );
    }

    // THE PRICE OF EACH LINE, from the server's own spots and the catalogue's
    // ask premium - written onto the rows createFromCheckout already made.
    for (const line of await orderItems.getFor(placed.order_id, tx)) {
      const priced = items.find((i) => i.id === line.bullion_id);
      if (!priced) continue;
      await orderItems.update(
        line.id,
        {
          confirmed: true,
          premium: Number(priced.ask_premium ?? 0),
          sales_tax_charged: rules.chargesSalesTax("sale") ? priced.sales_tax_rate : 0,
          price: calculateItemAsk(priced, spot_prices),
        },
        { order_id: placed.order_id },
        tx
      );
    }

    await taxService.updateStateSalesTax(prices.sales_tax, address.state, tx);
    if (payment_intent_id) {
      await paymentsService.attachOrder(payment_intent_id, placed.order_id, tx);
    }
    await checkoutService.resetAfterOrder(checkout.user_id, "sale", tx);

    return placed.order_id;
  });
}
