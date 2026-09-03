// Placing an order, both directions. Read what the server holds, decide the
// money, do the outside-world work that cannot be rolled back, then write every
// row in ONE transaction and compensate if it fails.
//
// TWO DOORS, AND THE SECOND IS TEMPORARY. `placeOrder` is the zero-body create
// (D210) - every choice is already a server-side resource. `placeSale` still
// takes a body because the sales checkout is not converted to the row yet; it
// collapses createSalesOrder and adminCreateSalesOrder, the actor passed in.
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
import * as metalsRepo from "#db/metals/repo.ts";

import * as addressService from "#domain/places/addresses/service.ts";
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
import * as readService from "#domain/orders/read.service.ts";
import { calculateItemAsk, calculateSalesOrderTotal } from "#domain/pricing/service.ts";
import * as rules from "#domain/orders/rules.ts";
import { retierScrapPremiums } from "#domain/orders/edit-line.ts";

import withTransaction from "#shared/db/withTransaction.ts";
import { refuse } from "#shared/http/refuse.ts";
import { auth } from "#domain/auth/client.ts";
import { fromNodeHeaders } from "better-auth/node";
import { FEDEX_STORE_ADDRESS, FEDEX_CARRIER_ID } from "#providers/shipments/constants.ts";
import type { CheckoutRow } from "#db/checkout/checkouts/repo.ts";
import type { PaymentSession } from "#domain/payments/service.ts";
import type { IncomingHttpHeaders } from "node:http";

// The executor is how each step joins the caller's transaction: an order that
// half-exists is the failure that guards.
type Executor = PoolClient | undefined;

// ===========================================================================
// THE SHARED CORE: a checkout becomes an order
// ===========================================================================

// A line whose metal cannot be resolved is REFUSED, never skipped: an order
// silently missing a line means the customer's metal arrives unrecorded.
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
    // Not confirmed and untaxed: confirmation is the admin's act, and a
    // purchase pays no sales tax (rules.chargesSalesTax).
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

// ONE QUOTE PER METAL THE ORDER CONTAINS, at the live spot. Read, decide in
// rules, then plain creates - the rule does not belong inside a statement.
async function freezeSpots(order_id: string, executor?: Executor) {
  const lines = await orderItems.getFor(order_id, executor);
  const live = await spotsService.getSpotPrices(executor);
  for (const spot of rules.spotsToFreeze(lines, live)) {
    await orderSpots.create(
      { order_id, metal_id: spot.metal_id, ask: spot.ask, bid: spot.bid },
      executor
    );
  }
}

// COPYING IS THE WHOLE POINT: editing a book entry afterwards must not rewrite
// where a parcel was sent, and deleting one must not take the record away.
async function snapshotAddress(
  order_id: string,
  source_address_id: string | null | undefined,
  executor?: Executor
) {
  if (!source_address_id) return null;
  const snapshot_id = await addressService.snapshot(source_address_id, executor);
  if (!snapshot_id) return null;
  await orderAddresses.create(
    { order_id, address_id: snapshot_id, source_address_id }, executor
  );
  return snapshot_id;
}

// `status` is the caller's: what an order starts as differs by direction and by
// how it was placed.
export async function createFromCheckout(
  {
    checkout_id,
    status,
    notes = null,
  }: {
    checkout_id: string;
    status: string;
    notes?: string | null;
  },
  executor?: Executor
) {
  const checkout = await checkoutService.getRowById(checkout_id, executor);
  if (!checkout) throw new Error(`no such checkout: ${checkout_id}`);

  const direction = checkout.direction as rules.Direction;
  const { id: order_id, number } = await ordersRepo.create(
    { user_id: checkout.user_id, direction, status, notes },
    executor
  );

  // ONE ENGAGEMENT PER ORDER, EVERY ORDER (093), values NULL until a refinery
  // is involved.
  await refinerOrders.ensureForOrder(order_id, executor);

  await copyItems(order_id, checkout_id, executor);
  await retierScrapPremiums(order_id, executor);
  await freezeSpots(order_id, executor);

  // The refiner counterparts: one per customer line, one per frozen spot.
  await refinerItems.mirrorLinesForOrder(order_id, executor);
  await refinerSpots.coverFromOrderSpots(order_id, executor);

  // A purchase records a shipper, a sale a recipient, a pickup a pickup
  // address; only one is ever set.
  await snapshotAddress(
    order_id,
    checkout.shipper_address_id ??
      checkout.recipient_address_id ??
      checkout.pickup_address_id ??
      null,
    executor
  );

  // The draft the checkout mutated is ATTACHED (D208), falling back to the
  // method column and then the default. All three go through the service so its
  // checks apply.
  const fulfillment = checkout.fulfillment_id
    ? await fulfillmentService.attachDraft(
        { fulfillment_id: checkout.fulfillment_id, order_id },
        executor
      )
    : checkout.fulfillment_method_id
      ? await fulfillmentService.chooseById(
          { order_id, method_id: checkout.fulfillment_method_id },
          executor
        )
      : await fulfillmentService.chooseDefault(
          { order_id, direction, category: "SHIPMENT" },
          executor
        );

  // Not reachable today; kept because a TypeError here would roll the order
  // back with a message that says nothing about an order.
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
        start_time: checkout.appointment_time,
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
        start_time: checkout.appointment_time,
      },
      executor
    );
  }

  return { order_id, number, fulfillment_id: fulfillment.id };
}

// ===========================================================================
// THE PURCHASE DOOR: the zero-body create (D210)
// ===========================================================================

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

// DB-only and provider-free, which is what makes it testable. Every choice is
// already a server-side resource: ids, draft fulfillment, sealed payout.
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

  // The FEE is the method row's own flat fee - server money, never a client's.
  const purchaseMethods = await paymentMethods.listFor("purchase");
  const payoutMethod = purchaseMethods.find((m) => m.id === row.payment_method_id);
  const payout_fee = Number(payoutMethod?.flat_fee ?? 0);

  const composed = await addressService.getFromId(row.shipper_address_id as string);
  const mine = composed.find((a) => a.user_address.user_id === user_id);
  if (!mine) throw refuse(400, "the checkout's shipper address is not in your book");

  const pkgRow = await packagesRepo.getOne(row.package_id as string);
  if (!pkgRow) throw refuse(400, "the checkout names a package that does not exist");
  const weightValue = Number(row.package_weight ?? 0);
  if (!(weightValue > 0)) throw refuse(400, "the parcel needs a weight");

  // A real carrier row, resolved to the carrier's catalogue entry for its enum
  // codes. Carrier-agnostic sale rows (110) price delivery and buy no labels.
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

  // The handoff is chosen by CAPABILITY - the schedulable one is the pickup.
  // No carrier enum is ever spelled here.
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

// THE TRANSACTION HALF, its own function so the rows can be tested with no
// provider call reachable.
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
    { checkout_id: resolved.row.id, status: "In Transit" },
    client
  );

  // NO EXCHANGE ROWS AT ALL (D210, ruling 36): the bank numbers are sealed in
  // payments.details at the payout step, so the anchor is gone.
  await orderTransactions.create(
    {
      order_id,
      shipping: netCharge,
      shipping_service: resolved.service.name,
      used_funds: false,
    },
    client
  );
  const payoutRecorded = await orderTransactions.update(
    order_id,
    { payout_details_id: resolved.payout_details_id, payout_fee: resolved.payout_fee },
    {},
    client
  );
  if (!payoutRecorded) {
    throw new Error(
      `order ${order_id}: the payout account and fee were not recorded - ` +
      `this transaction must not commit`
    );
  }

  // Written once with everything known - ids straight off the checkout row.
  const shipment_id = await newShipments.create({ id: randomUUID(), direction: "Inbound" }, client);
  const recorded = await newShipments.update(
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
        confirmation_number: pickupResult.confirmationNumber,
        location: pickupResult.location,
      },
      client
    );
  }

  await checkoutService.resetAfterOrder(user_id, "purchase", client);
  return { order_id, number, fulfillment_id, shipment_id };
}

// The whole flow: resolve, price the postage, buy the label, record, clean up.
export async function placeOrder(user_id: string) {
  const resolved = await resolvePurchaseCheckout(user_id);

  // The insured amount is clamped BEFORE anything reads it (D132), and postage
  // is the SERVER's price - rated right before the label it pays for.
  resolved.declaredValue = await carrierServices.clampInsuredValue(
    resolved.declaredValue, resolved.service.serviceType
  );
  const rates = await shippingOperations.getRates({
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

  // Outside-world work first, each step undone if the next fails: a label must
  // exist before the row can record it, so the compensation is voiding it.
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
  const buffer = await shippingOperations.labelBufferOrVoid(labelData);

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
      await shippingOperations.voidLabel(labelData.tracking_number);
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
    await shippingOperations.voidPickup(
      pickupResult && {
        confirmationNumber: pickupResult.confirmationNumber,
        location: pickupResult.location,
        pickupDate: resolved.schedule?.date ?? null,
      }
    );
    await shippingOperations.voidLabel(labelData.tracking_number);
    throw err;
  }

  // Device-sync data: a failed clear is a stale basket, not lost data.
  try {
    await checkoutService.syncCart(user_id, "purchase", []);
  } catch {
    /* the next sync heals it */
  }

  const created = await readService.findPurchaseById(placed.order_id);
  await emailService.sendOrderPlacedConfirmation(placed.order_id);
  return created;
}

// ===========================================================================
// THE SALE DOOR
// ===========================================================================

// req.body, so every field is whatever arrived - which is why the items and the
// address are re-fetched by id and the price comes from the server's spots.
export type SalesOrderInput = {
  address: { id: string };
  items: { id: string; quantity: number }[];
  using_funds?: boolean | null;
  // `value` prices the delivery; `label` is stored as shipping_service.
  service: { value?: string | null; label?: string | null };
  payment_method?: string | null;
};

type SaleActor = { id: string; name?: string | null; dorado_funds?: number | null };

const asNumber = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

// Loose on purpose: a priced line has been through pricing and tax and picked
// up fields along the way, and this file does not own that shape.
type PricedItem = Record<string, unknown> & {
  id?: unknown; quantity?: unknown; ask_premium?: unknown;
  sales_tax_rate?: unknown; metal_id?: unknown; metal_type?: unknown;
};

// Four rows: the order, its engagement, its money and its address link.
async function insertSale(
  client: PoolClient,
  { user, status, sales_order, orderPrices }: {
    user: SaleActor;
    status: string;
    sales_order: SalesOrderInput;
    orderPrices: ReturnType<typeof calculateSalesOrderTotal>;
  }
): Promise<string> {
  const id = randomUUID();
  await ordersRepo.create({ id, user_id: user.id, direction: "sale", status }, client);
  await refinerOrders.ensureForOrder(id, client);

  // A MAPPING, NOT A COPY: five of these change name between pricing's output
  // and the column. The repo defaults an absent field to NULL.
  await orderTransactions.create(
    {
      order_id: id,
      total: orderPrices.order_total,
      shipping: orderPrices.shipping_charge,
      shipping_service: sales_order.service?.label,
      funds: orderPrices.pre_charges_amount,
      post_charges_amount: orderPrices.post_charges_amount,
      subject_to_charges_amount: orderPrices.subject_to_charges_amount,
      used_funds: sales_order.using_funds,
      items: orderPrices.item_total,
      base_total: orderPrices.base_total,
      surcharge: orderPrices.charges_amount,
      sales_tax: orderPrices.sales_tax,
    },
    client
  );

  // Both ids are the book row: a sale takes no snapshot until its checkout is
  // converted to the row flow.
  await orderAddresses.create(
    { order_id: id, address_id: sales_order.address.id, source_address_id: sales_order.address.id },
    client
  );

  return id;
}

// A sale is always bullion, so a line's metal comes from its PRODUCT; one that
// cannot be resolved would write null into a NOT NULL column and is refused.
//
// STOREFRONT ITEMS CARRY THE NAME, NOT THE ID, so the name lookup is not a
// fallback - it is the path every customer order takes.
async function insertSaleLines(
  client: PoolClient,
  orderId: string,
  items: PricedItem[],
  spot_prices: { name: string; ask?: number | null; bid?: number | null }[]
): Promise<void> {
  const idByName = await metalsRepo.idsByName(client);

  for (const item of items) {
    const metal_id =
      (item.metal_id as string | null) ??
      (item.metal_type ? idByName.get(item.metal_type as string) : undefined);
    if (!metal_id) {
      throw refuse(
        422,
        `product ${String(item.id)} has no metal, so its order line cannot be written`
      );
    }
    await orderItems.create(
      {
        order_id: orderId,
        bullion_id: typeof item.id === "string" ? item.id : null,
        metal_id,
        premium: asNumber(item.ask_premium),
        quantity: asNumber(item.quantity),
        confirmed: true,
        sales_tax_charged: asNumber(item.sales_tax_rate) ?? 0,
        price: calculateItemAsk(item as never, spot_prices as never),
      },
      client
    );
  }

  for (const spot of spot_prices) {
    // A metal the quote names but the database lacks is skipped, not invented.
    const metal_id = idByName.get(spot.name);
    if (metal_id) {
      await orderSpots.create(
        { order_id: orderId, metal_id, ask: spot.ask, bid: spot.bid },
        client
      );
    }
  }

  // 093's coverage invariant: no customer line or spot without its refiner row.
  await refinerItems.mirrorLinesForOrder(orderId, client);
  await refinerSpots.coverFromOrderSpots(orderId, client);
}

// A SECOND, independent lookup from the one requireUser did, so it can answer
// null even on a guarded route. A missing session is a 401, not a 500.
export async function callerFrom(headers: IncomingHttpHeaders): Promise<SaleActor> {
  const session = (await auth.api.getSession({
    headers: fromNodeHeaders(headers),
  })) as PaymentSession | null;
  if (!session?.user?.id) {
    throw refuse(401, "no session - an order cannot be placed without one");
  }
  return session.user;
}

// Placing a sale. One function for what were createSalesOrder and
// adminCreateSalesOrder: they differed only in where the actor came from.
//
// CREATE-THEN-CHARGE: the order exists before any money moves. The old ordering
// left a paid customer with no order when the second half failed (D179).
//
// SPOT PRICES COME FROM THE SERVER, NOT THE BODY. A body-supplied ask of 1 once
// recorded $26.81 for an ounce of gold and the payment intent agreed with it.
// A held quote needs a table and is written up in FOLLOWUPS.
export async function placeSale({
  sales_order,
  payment_intent_id,
  user,
}: {
  sales_order: SalesOrderInput;
  payment_intent_id: string;
  user: SaleActor;
}) {
  const address = await addressService.getAddressFromId(sales_order.address.id);
  if (!address) throw refuse(400, `no address ${sales_order.address.id}`);

  const serverItems = await productService.getItemsFromServer(sales_order.items);
  const spot_prices = await spotsService.getSpotPrices();
  const items = await taxService.attachSalesTaxToItems(
    address.state, serverItems, spot_prices
  );

  // Pricing is pure and lives outside the transaction: the verification below
  // needs the number before anything is written.
  const orderPrices = calculateSalesOrderTotal(
    items,
    sales_order.using_funds,
    spot_prices,
    user,
    sales_order.service.value,
    sales_order.payment_method
  );
  const cents = rules.chargeCents(orderPrices.post_charges_amount);

  // THE INTENT IS VERIFIED, WHERE IT USED TO BE TRUSTED: the old code attached
  // whatever id the body named, whosever it was.
  let alreadySucceeded = false;
  if (cents > 0) {
    if (rules.belowStripeMinimum(cents)) {
      throw refuse(422, "the amount left to charge is below Stripe's $0.50 minimum");
    }
    if (typeof payment_intent_id !== "string" || payment_intent_id.length === 0) {
      throw refuse(400, "this order has a card charge and no payment intent was named");
    }
    const intent = await paymentsService.findIntentByRef(payment_intent_id);
    // "does not exist" and "is not yours" are deliberately one answer, and
    // ownership is the NAMED CUSTOMER's rather than the admin's.
    if (!intent || intent.user_id !== user.id) {
      throw refuse(403, "that payment intent does not exist");
    }
    if (intent.payment_status === "canceled") {
      throw refuse(409, "that payment intent was cancelled - start checkout again");
    }

    switch (rules.attachmentVerdict(intent)) {
      case "conflict":
        throw refuse(409, "that payment intent already belongs to an order");
      case "supersede":
        // An abandoned checkout is SUPERSEDED, not refused: the intent is reused
        // until it settles, and refusing strands the customer trying to pay.
        await withTransaction(async (client) => {
          await sweeps.cancelPendingSale(intent.sales_order_id as string, client);
          await paymentsService.attachOrder(payment_intent_id, null, client);
        });
        break;
      default:
        break;
    }

    if (rules.isSettled(intent.payment_status)) {
      // A settled, unattached intent is D179 wreckage arriving to be repaired:
      // the money is real, so the order is born paid IF the amount still matches.
      if (!rules.repairAmountMatches(intent.amount, cents)) {
        throw refuse(
          409,
          `payment ${payment_intent_id} was taken at a different price than ` +
          `this order totals now - contact support with that reference`
        );
      }
      alreadySucceeded = intent.payment_status === "succeeded";
    } else {
      // The server sets the authoritative amount NOW - outside the transaction,
      // because a Stripe call cannot be rolled back - so the customer confirms
      // exactly what the server priced.
      const updated = await stripeProvider.updateIntent(payment_intent_id, { amount: cents });
      await paymentsService.updateFromProvider(updated);
    }
  }

  const orderId = await withTransaction(async (client) => {
    const orderId = await insertSale(client, {
      user,
      status: rules.statusAtPlacement(cents, alreadySucceeded),
      sales_order,
      orderPrices,
    });

    if (sales_order.using_funds === true) {
      // Credit is RESERVED at creation so the same dollars cannot be spent
      // twice; the abandonment sweep puts it back if the payment never arrives.
      await usersService.removeFunds(user.id, orderPrices.pre_charges_amount, client);
      await transactionsService.addTransactionLog(
        user.id, "Debit", null, orderId, orderPrices.pre_charges_amount, client
      );
    }

    await insertSaleLines(client, orderId, items, spot_prices);
    await taxService.updateStateSalesTax(orderPrices.sales_tax, address.state, client);

    if (cents > 0) {
      await paymentsService.attachOrder(payment_intent_id, orderId, client);
    }

    return orderId;
  });

  return await readService.findSaleById(orderId);
}
