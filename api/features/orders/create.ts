// Creating an order from a completed checkout.
//
// The last step of the decomposition: intake.ts said what the customer asked
// for, intake.repo.ts recorded it on their checkout, and this turns that
// checkout into an order, its items, its address snapshot and its fulfillment.
//
// ORCHESTRATION AND DOMAIN GUARDS ONLY (Jacob, 2026-09-01: separation of
// concerns). Every statement lives with the table it touches - the checkout
// reads in features/checkout/repo.next.ts, the order row and its lines,
// spots and address link in this feature's own repos, the address freeze in
// features/places/addresses. This file decides WHAT happens and in what
// order, refuses what must not happen, and holds no SQL.
//
// NOTHING CALLS THIS YET. features/orders/service.ts still serves traffic
// and is untouched. This exists so the two can be compared before either is
// switched.
//
// Everything here takes an executor and threads it, so an order and its
// fulfillment are one transaction. Nothing in it touches the outside world -
// the label and the courier are the caller's problem and happen before the
// transaction opens, which is the shape createPurchaseOrder was rebuilt into.
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";

import * as ordersRepo from "#features/orders/repo.ts";
import * as orderItems from "#features/orders/items/repo.ts";
import * as orderSpots from "#features/orders/spots/repo.ts";
import * as orderAddresses from "#features/orders/addresses/repo.ts";
import * as addressService from "#features/places/addresses/service.ts";
import * as fulfillmentService from "#features/fulfillments/service.ts";
// The two bookings are their own resources (ruling 26b): checkout reaches
// fulfillments/pickups and fulfillments/directs directly, never through the
// fulfillments parent controller or service.
import * as fulfillmentPickups from "#features/fulfillments/pickups/service.ts";
import * as fulfillmentDirects from "#features/fulfillments/directs/service.ts";
import * as refinerOrders from "#features/refiners/orders/repo.ts";
import * as refinerItems from "#features/refiners/items/repo.ts";
import * as refinerSpots from "#features/refiners/spots/repo.ts";
import * as ratesRepo from "#features/rates/service.ts";
import { getRatePct, sumContentByMetal } from "#features/rates/utils/resolveRate.ts";
import * as fulfillmentShipments from "#features/fulfillments/shipments/service.ts";
import type { CheckoutRow } from "#features/checkout/repo.next.ts";
import * as newShipments from "#features/shipping/shipments/repo.ts";
import * as pickupService from "#features/shipping/pickups/service.ts";
import * as packagesRepo from "#features/shipping/packages/repo.ts";
import * as servicesRepo from "#features/shipping/services/repo.ts";
import * as carrierServices from "#features/shipping/services/service.ts";
import * as handoffsService from "#features/shipping/handoffs/service.ts";
import * as shippingRatesService from "#features/shipping/operations/service.ts";
import * as shippingOps from "#features/shipping/operations/handler.ts";
import * as orderTransactions from "#features/orders/transactions/repo.ts";
import * as checkoutService from "#features/checkout/service.ts";
import * as emailService from "#features/media/emails/service.ts";
import * as readService from "#features/orders/read.service.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import { refuse } from "#shared/http/refuse.ts";
import {
  labelBufferOrUndo, undoLabel, undoPickup,
} from "#features/orders/service.ts";
import * as paymentMethods from "#features/payments/methods/repo.ts";
import { FEDEX_STORE_ADDRESS, FEDEX_CARRIER_ID } from "#providers/shipments/constants.ts";

// Passing the executor is how each step below joins the caller's transaction.
// Every one of these is called from inside one, and an order that half-exists
// is the failure this is guarding.
type Executor = PoolClient | undefined;

// orders.items.metal_id is NOT NULL, and a checkout item may carry only a
// bullion id - the repo read resolves the product's own metal onto the line.
//
// A line whose metal cannot be resolved is refused rather than skipped. An
// order silently missing a line is worse than an order that failed to be
// placed: the customer's metal arrives and nothing recorded that it was coming.
async function copyItems(order_id: string, checkout_id: string, executor?: Executor) {
  const lines = await checkoutService.getItemsForOrder(checkout_id, executor);

  if (!lines.length) throw new Error("a checkout with no items cannot become an order");

  const orphan = lines.find((i) => !i.metal_id);
  if (orphan) {
    throw new Error(
      `checkout item ${orphan.id} has no metal, and neither does the product it ` +
        `names - orders.items.metal_id is NOT NULL, so this order cannot be placed`
    );
  }

  for (const i of lines) {
    // Not confirmed and untaxed at placement: confirmation is the admin's act,
    // and a purchase pays no sales tax - the repo's own defaults.
    await orderItems.create(
      {
        order_id,
        bullion_id: i.bullion_id,
        metal_id: i.metal_id as string,
        pre_melt: i.pre_melt, post_melt: i.post_melt,
        purity: i.purity, content: i.content,
        premium: i.premium, quantity: i.quantity ?? 1,
        unit: i.unit,
      },
      executor
    );
  }
  return lines.length;
}

// THE PREMIUM IS THE BUSINESS'S, NOT THE BROWSER'S.
//
// The block the frontend posts carries a bid_premium per line, and taking it at
// face value means the price a customer is paid comes from their own client.
// The legacy path has always overwritten it - "Source of truth: (re)price every
// scrap item's premium from the rates table" - and the new path did not, which
// is exactly what comparing the two on the same input surfaced: 0.80 submitted
// against 0.87 owed, on the same order.
//
// Same rule as retierOrderScrapPremiums in features/orders/service.ts,
// against orders.items instead of exchange.purchase_order_items, and using the
// same rates helpers so the tiering itself has one definition. Scrap only:
// bullion keeps its own per-product premium.
//
// A no-op when there are no rate bands, which is the same thing the legacy
// helper does - an order placed with no rates configured keeps what it was
// given rather than being repriced to nothing.
async function retierScrapPremiums(order_id: string, executor?: Executor) {
  const rates = await ratesRepo.getAllRates();
  if (!rates?.length) return;

  const scrap = await orderItems.scrapLinesFor(order_id, executor);
  if (!scrap.length) return;

  const totals = sumContentByMetal(
    scrap,
    (i) => i.metal,
    (i) => Number(i.content) || 0
  );

  for (const line of scrap) {
    const total = totals[String(line.metal ?? "").toLowerCase()] ?? 0;
    const pct = getRatePct(rates, line.metal, total, "scrap");
    if (pct == null) continue;
    const repriced = await orderItems.setPremium(line.id, pct, executor);
    if (!repriced) {
      throw new Error(
        `order ${order_id}: line ${line.id} vanished mid-placement - its premium ` +
          `was not repriced and this transaction must not commit`
      );
    }
  }
}

// A snapshot of the address as it is now, plus a pointer back to the book row
// it came from. Copying is the whole point: editing an address afterwards must
// not silently rewrite where a parcel was sent, and deleting one from a book
// must not take the order's record of it away.
async function snapshotAddress(
  order_id: string,
  source_address_id: string | null | undefined,
  executor?: Executor
) {
  if (!source_address_id) return null;
  const snapshot_id = await addressService.snapshot(source_address_id, executor);
  if (!snapshot_id) return null;
  await orderAddresses.link(
    { order_id, address_id: snapshot_id, source_address_id }, executor
  );
  return snapshot_id;
}

// The whole thing.
//
// `status` is the caller's, not this function's: what an order starts as is a
// business decision that differs by direction and by how it was placed, and
// exchange's default of "In Transit" only makes sense for a parcel in the post.
export async function createFromCheckout(
  {
    checkout_id,
    status,
    created_by_id = null,
    notes = null,
  }: {
    checkout_id: string;
    status: string;
    created_by_id?: string | null;
    notes?: string | null;
  },
  executor?: Executor
) {
  const checkout = await checkoutService.getRowById(checkout_id, executor);
  if (!checkout) throw new Error(`no such checkout: ${checkout_id}`);

  const direction = checkout.direction;
  const { id: order_id, number } = await ordersRepo.create(
    {
      user_id: checkout.user_id,
      direction: direction as "purchase" | "sale",
      status, notes, created_by_id,
    },
    executor
  );

  // ONE ENGAGEMENT PER ORDER, EVERY ORDER (093): the refiner-side engagement
  // is born with the order, values NULL until a refinery is involved, and the
  // items and spots below get their refiner counterparts from it.
  await refinerOrders.ensureForOrder(order_id, executor);

  await copyItems(order_id, checkout_id, executor);
  await retierScrapPremiums(order_id, executor);
  await orderSpots.freezeFromItems(order_id, executor);

  // The refiner counterparts (093's mirror completion, applied to new
  // traffic): one refiners.items row per customer line and one unquoted
  // refiners.spots row per frozen customer spot.
  await refinerItems.mirrorLinesForOrder(order_id, executor);
  await refinerSpots.coverFromOrderSpots(order_id, executor);

  // Whichever address the checkout recorded is the one the order is about. A
  // purchase records a shipper (the customer posts the metal), a sale a
  // recipient, a pickup a pickup address; only one is ever set.
  await snapshotAddress(
    order_id,
    checkout.shipper_address_id ??
      checkout.recipient_address_id ??
      checkout.pickup_address_id ??
      null,
    executor
  );

  // THE FULFILLMENT. The draft the checkout mutated is ATTACHED (D208 -
  // Jacob's flow: the fulfillment already exists and the order takes it);
  // a checkout with no draft falls back to the method column, and one with
  // neither to the direction's default. All three run through the service so
  // its checks apply: the method has to belong to this direction, and a
  // booking has to match its method's category.
  const fulfillment = checkout.fulfillment_id
    ? await fulfillmentService.attachDraft(
        { fulfillment_id: checkout.fulfillment_id, order_id, updated_by_id: created_by_id },
        executor
      )
    : checkout.fulfillment_method_id
      ? await fulfillmentService.chooseById(
          { order_id, method_id: checkout.fulfillment_method_id, created_by_id },
          executor
        )
      : await fulfillmentService.chooseDefault(
          { order_id, direction: direction as "purchase" | "sale", category: "SHIPMENT", created_by_id },
          executor
        );

  // The fallbacks are declared to return null, and everything below reads
  // .method off the result straight away. Null is not reachable today; kept
  // because a TypeError here would roll the whole order back with a message
  // that says nothing about an order, a checkout or a fulfillment.
  if (!fulfillment) {
    throw new Error(
      `order ${order_id} was created from checkout ${checkout_id} but no ` +
        `fulfillment came back for it - the order cannot be handed over and ` +
        `this transaction must not commit`
    );
  }

  if (fulfillment.method.category === "PICKUP" && checkout.pickup_address_id) {
    await fulfillmentPickups.schedule(
      {
        fulfillment_id: fulfillment.id,
        pickup_address_id: checkout.pickup_address_id,
        start_time: checkout.appointment_time ?? null,
      },
      executor
    );
  }

  if (fulfillment.method.category === "DIRECT" && checkout.appointment_location_id) {
    await fulfillmentDirects.schedule(
      {
        fulfillment_id: fulfillment.id,
        location_id: checkout.appointment_location_id,
        is_appointment: fulfillment.method.type === "APPOINTMENT",
        start_time: checkout.appointment_time ?? null,
      },
      executor
    );
  }

  return { order_id, number, fulfillment_id: fulfillment.id };
}

// ---------------------------------------------------------------------------
// PLACING A PURCHASE ORDER FROM THE ROW (D208) - the live flow.
//
// The server already holds every choice: the checkout row carries the ids,
// the draft fulfillment carries the handoff, checkout.items carries the cart.
// The body brings only what CANNOT live server-side: the payout bank form
// (exchange.payouts is its one home until encryption), the parcel's weight,
// the pickup schedule, the insurance declaration.
//
// NOTHING here is shaped like the legacy composed body. The provider gets a
// label request; each table gets its own repo call; the one write exchange
// still receives is the payout and the minimal order row its foreign key
// demands - the bank-details anchor, not a mirror.

type PostalAddress = {
  line_1: string | null; line_2: string | null; city: string | null;
  state: string | null; country: string | null; country_code: string | null;
  zip: string | null; phone_number: string | null; is_residential: boolean | null;
};

type ResolvedPurchase = {
  row: CheckoutRow;
  wantsPickup: boolean;
  address: PostalAddress;
  recipientName: string | null;
  handoff: { code: string; name: string };
  service: { rowId: string; serviceType: string; carrierCode: string; name: string };
  pkg: {
    rowId: string;
    weight: { units: string; value: number };
    dimensions: { length: number; width: number; height: number; units: string };
  };
  payout_details_id: string;
  payout_fee: number;
  declaredValue: number;
  schedule: { date: string; time: string } | null;
};

// DB-only, provider-free - which is what makes it testable to the hilt.
// ZERO BODY (D210): every choice is already a server-side resource - the row's
// ids, the draft fulfillment, the sealed payout account - and this reads them.
export async function resolvePurchaseCheckout(user_id: string): Promise<ResolvedPurchase> {
  const row = await checkoutService.getRowFor(user_id, "purchase");

  const missing = (
    [
      ["shipper_address_id", row.shipper_address_id],
      ["package_id", row.package_id],
      ["carrier_service_id", row.carrier_service_id],
      ["fulfillment_id", row.fulfillment_id],
      ["payment_details_id", row.payment_details_id],
    ] as const
  ).filter(([, v]) => !v);
  if (missing.length) {
    throw refuse(
      400,
      `the checkout is not complete - missing ${missing.map(([k]) => k).join(", ")}`
    );
  }

  const draft = await fulfillmentService.getById(row.fulfillment_id as string);
  if (!draft) throw refuse(400, "the checkout names a fulfillment that does not exist");
  if (draft.order_id) {
    throw refuse(409, "the checkout's fulfillment already belongs to an order - refresh and start again");
  }
  if (draft.method.category !== "SHIPMENT") {
    throw refuse(
      400,
      `a ${draft.method.category} fulfillment cannot be placed through the shipping ` +
        `checkout yet - choose a shipping handoff`
    );
  }
  const wantsPickup = draft.method.type === "CARRIER PICKUP";
  if (wantsPickup && (!row.pickup_date || !row.pickup_time)) {
    throw refuse(400, "a carrier pickup needs a date and a time");
  }

  // The payout account was recorded at the payout step; the FEE is the
  // method row's own flat fee - server money, never a client figure.
  const purchaseMethods = await paymentMethods.getAll("purchase");
  const payoutMethod = purchaseMethods.find((m) => m.id === row.payment_method_id);
  const payout_fee = Number(payoutMethod?.flat_fee ?? 0);

  const composed = await addressService.getFromId(row.shipper_address_id as string);
  const mine = composed.find((a) => a.user_address.user_id === user_id);
  if (!mine) throw refuse(400, "the checkout's shipper address is not in your book");

  const pkgRow = await packagesRepo.getOne(row.package_id as string);
  if (!pkgRow) throw refuse(400, "the checkout names a package that does not exist");
  const weightValue = Number(row.package_weight ?? 0);
  if (!(weightValue > 0)) throw refuse(400, "the parcel needs a weight");

  // The label service: a real carrier row, resolved to the carrier's own
  // catalogue entry for its enum codes. The carrier-agnostic sale rows (110)
  // are refused - they price a sale's delivery, they buy no labels.
  const svcRow = await servicesRepo.getOne(row.carrier_service_id as string);
  if (!svcRow) throw refuse(400, "the checkout names a carrier service that does not exist");
  if (!svcRow.carrier_id) {
    throw refuse(400, `${svcRow.name} is a sale delivery service, not a label service`);
  }
  const offered = await carrierServices.getOfferedServices();
  const catalogue = offered.find(
    (o) => o.name.toLowerCase() === String(svcRow.name).toLowerCase()
  );
  if (!catalogue) {
    throw refuse(400, `${svcRow.name} is not a label service the carrier offers`);
  }

  // The fulfillment method decides the carrier handoff, by CAPABILITY - the
  // schedulable one is the pickup. No carrier enum is ever spelled here.
  const handoffs = await handoffsService.getHandoffs();
  const handoff = handoffs.find((h) => h.requires_schedule === wantsPickup);
  if (!handoff) throw refuse(500, "the carrier's handoff catalogue is missing an option");

  return {
    row,
    wantsPickup,
    address: {
      line_1: mine.line_1, line_2: mine.line_2, city: mine.city, state: mine.state,
      country: mine.country, country_code: mine.country_code, zip: mine.zip,
      phone_number: mine.phone_number, is_residential: mine.is_residential,
    },
    recipientName: mine.user_address.label ?? null,
    handoff: { code: handoff.code, name: handoff.name },
    service: {
      rowId: row.carrier_service_id as string,
      serviceType: catalogue.code,
      carrierCode: catalogue.carrier_code,
      name: catalogue.name,
    },
    pkg: {
      rowId: row.package_id as string,
      weight: { units: "LB", value: weightValue },
      dimensions: {
        length: Number(pkgRow.length), width: Number(pkgRow.width),
        height: Number(pkgRow.height), units: "IN",
      },
    },
    payout_details_id: row.payment_details_id as string,
    payout_fee,
    declaredValue: Number(row.declared_value ?? 0),
    schedule: wantsPickup
      ? { date: row.pickup_date as string, time: row.pickup_time as string }
      : null,
  };
}

// THE TRANSACTION HALF, its own function so the rows can be tested without a
// provider call being reachable: the order core from the checkout, the
// bank-details anchor, the money row, the shipment, the booking, the reset.
export async function recordPlacedPurchase(
  client: PoolClient,
  {
    user_id, resolved, netCharge,
    label = null, pickupResult = null,
  }: {
    user_id: string;
    resolved: ResolvedPurchase;
    netCharge: number | null;
    label?: { tracking_number?: string | null; buffer?: unknown } | null;
    pickupResult?: { confirmationNumber?: string | null; location?: string | null } | null;
  }
) {
  const { order_id, number, fulfillment_id } = await createFromCheckout(
    { checkout_id: resolved.row.id, status: "In Transit", created_by_id: user_id },
    client
  );

  // NO EXCHANGE ROWS AT ALL (D210, ruling 36). The bank numbers this flow
  // used to anchor in exchange.payouts are SEALED in payments.details at the
  // payout step now, so the anchor - and with it every exchange write on this
  // path - is gone. The order's money row links the account and records the
  // fee from the method's own flat fee.
  await orderTransactions.create(
    {
      order_id,
      shipping: netCharge,
      shipping_service: resolved.service.name,
      used_funds: false,
    },
    client
  );
  const linked = await orderTransactions.setPayoutAccount(
    order_id, resolved.payout_details_id, null, client
  );
  if (!linked) {
    throw new Error(
      `order ${order_id}: the payout account was not linked - this transaction must not commit`
    );
  }
  const feeSet = await orderTransactions.setAmount(
    order_id, "payout_fee", resolved.payout_fee, null, client
  );
  if (!feeSet) {
    throw new Error(
      `order ${order_id}: the payout fee was not recorded - this transaction must not commit`
    );
  }

  // The parcel, written once with everything known - ids straight off the
  // checkout row, no name resolution, no read-modify-write.
  const shipment_id = await newShipments.create(randomUUID(), "Inbound", client);
  const recorded = await newShipments.record(
    shipment_id,
    {
      tracking_number: label?.tracking_number ?? null,
      shipping_status: "Label Created",
      label: (label?.buffer as Buffer | string | null) ?? null,
      label_type: "Generated",
      pickup_type: resolved.handoff.name,
      package_id: resolved.pkg.rowId,
      carrier_service_id: resolved.service.rowId,
      cost: netCharge,
      insured: resolved.declaredValue > 0,
      declared_value: resolved.declaredValue > 0 ? resolved.declaredValue : null,
      direction: "Inbound",
    },
    client
  );
  if (!recorded) {
    throw new Error(
      `order ${order_id}: shipment ${shipment_id} vanished mid-placement - the ` +
        `label was not recorded and this transaction must not commit`
    );
  }
  await fulfillmentShipments.link({ fulfillment_id, shipment_id }, client);

  if (pickupResult && resolved.schedule) {
    await pickupService.recordForShipment(
      {
        shipment_id,
        date: resolved.schedule.date,
        time: resolved.schedule.time,
        confirmation_number: pickupResult.confirmationNumber ?? null,
        location: pickupResult.location ?? null,
      },
      client
    );
  }

  await checkoutService.resetAfterOrder(user_id, "purchase", client);
  return { order_id, number, fulfillment_id, shipment_id };
}

// The whole flow: resolve, price the postage, buy the label, record, clean up.
export async function placePurchaseOrder(user_id: string) {
  const resolved = await resolvePurchaseCheckout(user_id);

  // The insured amount is clamped BEFORE anything reads it (D132), and the
  // price of postage is the SERVER's - the composed path took netCharge from
  // the body, a client-supplied money figure; this rates the parcel itself,
  // right before buying the label it prices.
  resolved.declaredValue = await carrierServices.clampInsuredValue(
    resolved.declaredValue, resolved.service.serviceType
  );
  const rates = await shippingRatesService.getRates({
    shippingType: "Inbound",
    address: resolved.address,
    pkg: { weight: resolved.pkg.weight, dimensions: resolved.pkg.dimensions },
    pickupType: resolved.handoff.code,
    declaredValue:
      resolved.declaredValue > 0
        ? { amount: resolved.declaredValue, currency: "USD" }
        : undefined,
  });
  const rate = (rates as Array<{ serviceType?: string; netCharge?: number }>).find(
    (r) => r.serviceType === resolved.service.serviceType
  );
  if (!rate || rate.netCharge == null) {
    throw refuse(
      422,
      `the carrier quoted no rate for ${resolved.service.name} - try a different service`
    );
  }
  const netCharge = rate.netCharge;

  // Outside-world work first, each step undone if the next fails - the shape
  // the composed path proved (a label failure is still "nothing happened").
  const labelData = await shippingOps.createLabel(FEDEX_CARRIER_ID, undefined, {
    shipper: {
      contact: {
        personName: resolved.recipientName,
        phoneNumber: resolved.address.phone_number,
      },
      address: resolved.address,
    },
    recipient: {
      contact: {
        personName: process.env.FEDEX_DORADO_NAME,
        phoneNumber: process.env.FEDEX_DORADO_PHONE_NUMBER,
      },
      address: FEDEX_STORE_ADDRESS,
    },
    serviceType: resolved.service.serviceType,
    pickupType: resolved.handoff.code,
    pkg: { weight: resolved.pkg.weight, dimensions: resolved.pkg.dimensions },
    insurance: {
      declaredValue: { amount: resolved.declaredValue, currency: "USD" },
    },
  });
  const buffer = await labelBufferOrUndo(labelData);

  let pickupResult: { confirmationNumber?: string | null; location?: string | null } | null = null;
  if (resolved.wantsPickup && resolved.schedule) {
    try {
      pickupResult = await shippingOps.createPickup(FEDEX_CARRIER_ID, undefined, {
        pickupContact: {
          personName: resolved.recipientName,
          phoneNumber: resolved.address.phone_number,
        },
        pickupAddress: resolved.address,
        pickupDate: resolved.schedule.date,
        pickupTime: resolved.schedule.time,
        carrierCode: resolved.service.carrierCode ?? "FDXE",
        trackingNumber: labelData.tracking_number,
      });
    } catch (err) {
      await undoLabel(labelData.tracking_number);
      throw err;
    }
  }

  let placed: Awaited<ReturnType<typeof recordPlacedPurchase>>;
  try {
    placed = await withTransaction((client) =>
      recordPlacedPurchase(client, {
        user_id,
        resolved,
        netCharge,
        label: { tracking_number: labelData.tracking_number, buffer },
        pickupResult,
      })
    );
  } catch (err) {
    await undoPickup(
      pickupResult && { ...pickupResult, pickupDate: resolved.schedule?.date }
    );
    await undoLabel(labelData.tracking_number);
    throw err;
  }

  // The cart became the order; the server clears its copy. Device-sync data -
  // a failed clear is a stale basket, not lost data.
  try {
    await checkoutService.syncSellCart(user_id, []);
  } catch {
    /* the next sync heals it */
  }

  const created = await readService.findPurchaseById(placed.order_id);
  await emailService.sendOrderPlacedConfirmation(placed.order_id);
  return created;
}
