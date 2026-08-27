import withTransaction from "#shared/db/withTransaction.js";
import * as purchaseOrderRepo from "#features/purchase-orders/repo.js";
import * as scrapRepo from "#features/scrap/repo.js";
import * as transactionRepo from "#features/transactions/repo.js";
import * as ratesRepo from "#features/rates/repo.js";
import { calculateTotalPrice } from "#features/purchase-orders/utils/calculations.ts";
import { getRatePct, sumContentByMetal } from "#features/rates/utils/resolveRate.ts";

import * as shipmentRepo from "#features/shipping/shipments/repo.js";
import * as pickupRepo from "#features/shipping/pickups/repo.js";
import * as shippingOps from "#features/shipping/operations/handler.ts";

import type {
  PurchaseOrderRow,
  OrderMetalRow,
  OrderScrapItemRow,
  ExpiredOfferRow,
} from "#features/purchase-orders/repo.next.ts";
import type { SpotPriceWire, PurchaseOrderItemWire } from "@dorado/contracts";

// `order` here is whatever the caller had - a row from getById, or the body of
// a request. The functions below read a handful of fields off it, and those are
// what this names. It is deliberately not PurchaseOrderRow: several callers are
// controllers handing over req.body.
type OrderLike = PurchaseOrderRow &
  Record<string, any> & {
    order_items: PurchaseOrderItemWire[];
    shipment?: { shipping_charge?: number | null } | null;
    payout: { cost: number };
  };

import {
  DORADO_ADDRESS,
  FEDEX_STORE_ADDRESS,
  FEDEX_CARRIER_ID,
} from "#providers/shipments/constants.ts";

// Compensation for an external action a failed transaction has orphaned.
//
// The rule in CLAUDE.md is "do the database work, commit, then act on the
// outside world", and for creation that ordering is not available: a label has
// to exist before the shipment row can record its tracking number. So the label
// is created first and undone if the database work fails - the saga shape, with
// cancelling as the compensating action.
//
// It never masks the original error. If the compensation itself fails there is
// genuinely an orphaned label, and that is worth a loud line in the log rather
// than a second exception nobody can act on: the first error is the one that
// explains what went wrong.
async function undoLabel(trackingNumber: string | undefined | null): Promise<void> {
  if (!trackingNumber) return;
  try {
    await shippingOps.cancelLabel(FEDEX_CARRIER_ID, undefined, { trackingNumber });
  } catch (err) {
    console.error(
      `ORPHANED SHIPPING LABEL ${trackingNumber}: the order it belonged to was ` +
        `rolled back and cancelling the label failed too - ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

async function undoPickup(
  pickup:
    | { confirmationNumber?: string | null; pickupDate?: unknown; location?: unknown }
    | null
    | undefined
): Promise<void> {
  if (!pickup?.confirmationNumber) return;
  try {
    await shippingOps.cancelPickup(FEDEX_CARRIER_ID, undefined, {
      confirmationCode: pickup.confirmationNumber,
      pickupDate: pickup.pickupDate as string | undefined,
      location: pickup.location as string | undefined,
    });
  } catch (err) {
    console.error(
      `ORPHANED CARRIER PICKUP ${pickup.confirmationNumber}: the order it ` +
        `belonged to was rolled back and cancelling the pickup failed too - ` +
        `${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// A LABEL WITH NO FILE IS STILL A LABEL FEDEX HAS BILLED FOR.
//
// parseCreateShipment reads the label document off a deeply optional path -
// `shipment?.pieceResponses?.[0]?.packageDocuments?.[0]?.encodedLabel ?? null` -
// while the tracking number comes from a different field. So a response can
// carry a real, billable tracking number and no label file, and
// `Buffer.from(null, "base64")` throws a TypeError.
//
// Both call sites built that buffer AFTER the label existed but BEFORE the try
// that compensates, so the TypeError escaped with the label left behind: no
// shipment row, no order, and NO "ORPHANED SHIPPING LABEL" line either, because
// undoLabel was never reached. Silent, which is the part that matters.
//
// This is not the same as the ORPHANED SHIPPING LABEL entries already in the
// logs - those are undoLabel firing and failing, which is the case that does
// announce itself. This one never got that far.
//
// Found by converting this file to TypeScript; the contract has always said
// `string | null`, and JavaScript had no reason to mention it.
// `cancel` is a SEPARATE parameter rather than a field on labelData, for the
// reason emails/service.ts gives about `transport`: labelData comes from the
// carrier's response, and a field would be reachable from something the carrier
// said. Nothing in production passes one; the test passes a recorder, which is
// what makes this assertable without a FedEx call.
export type CancelLabel = (trackingNumber: string | undefined | null) => Promise<void>;

export async function labelBufferOrUndo(
  labelData: {
    labelFile: string | null;
    tracking_number: string | null;
  },
  cancel: CancelLabel = undoLabel
): Promise<Buffer> {
  if (!labelData.labelFile) {
    await cancel(labelData.tracking_number);
    throw new Error(
      "the carrier created a shipment but returned no label file - the label has been cancelled"
    );
  }
  return Buffer.from(labelData.labelFile, "base64");
}

export async function listOrdersForUser(userId: string): Promise<PurchaseOrderRow[]> {
  return purchaseOrderRepo.findAllByUser(userId);
}

export async function getById(orderId: string): Promise<PurchaseOrderRow | undefined> {
  return purchaseOrderRepo.findById(orderId);
}

export async function getAll(): Promise<PurchaseOrderRow[]> {
  return purchaseOrderRepo.getAll();
}

export async function getMetalsForOrder(orderId: string): Promise<OrderMetalRow[]> {
  return purchaseOrderRepo.findMetalsByOrderId(orderId);
}

export async function acceptOffer({
  order,
  order_spots,
  spot_prices,
}: {
  order: OrderLike;
  order_spots: SpotPriceWire[];
  spot_prices: SpotPriceWire[];
}): Promise<{ purchaseOrder: PurchaseOrderRow | undefined; orderSpots: SpotPriceWire[] }> {
  const updatedSpots = await withTransaction(async (client) => {
    const spots = order.spots_locked
      ? order_spots
      : await purchaseOrderRepo.updateOrderMetals(order.id, spot_prices, client);

    await purchaseOrderRepo.updateRefinerMetals(order.id, spots, client);

    await purchaseOrderRepo.updateOrderItemPrices(
      order.id,
      order.order_items,
      spots,
      client
    );

    const total = calculateTotalPrice(order, spots);
    await purchaseOrderRepo.moveOrderToAccepted(order.id, total, client);

    return spots;
  });

  const purchaseOrder = await getById(order.id);
  return { purchaseOrder, orderSpots: updatedSpots };
}

export async function rejectOffer({
  orderId,
  offerNotes,
}: {
  orderId: string;
  offerNotes: string | null;
}): Promise<unknown> {
  return withTransaction((client) =>
    purchaseOrderRepo.rejectOfferById(orderId, offerNotes, client)
  );
}

// Cancelling an order generates a return label, and a return label is a real
// billable thing FedEx cannot be asked to forget.
//
// It used to be created in the middle of the transaction that cancels the
// order, so any failure after it - the shipment insert, the shipment update -
// rolled the record back and left the label in existence with nothing pointing
// at it. Nobody would ever have found it.
//
// The label is now created BEFORE the transaction and cancelled if the
// transaction fails, which is the only ordering that keeps the customer-visible
// behaviour identical. A label failure still means no cancellation happened at
// all, exactly as before; what changes is that a database failure no longer
// leaves a label behind. Cancelling is idempotent, so the compensation is safe
// to attempt and safe to repeat.
export async function cancelOrder({
  order,
  return_shipment,
}: {
  order: OrderLike;
  return_shipment: Record<string, any>;
}): Promise<unknown> {
  const shipper = {
    contact: {
      personName: process.env.FEDEX_DORADO_NAME,
      phoneNumber: process.env.FEDEX_DORADO_PHONE_NUMBER,
    },
    address: DORADO_ADDRESS,
  };

  const recipient = {
    contact: {
      personName: return_shipment.address.name,
      phoneNumber: return_shipment.address.phone_number,
    },
    address: return_shipment.address,
  };

  const labelData = await shippingOps.createLabel(FEDEX_CARRIER_ID, undefined, {
    shipper,
    recipient,
    serviceType: return_shipment.service?.serviceType,
    pickupType: return_shipment.pickup?.label,
    pkg: {
      weight: return_shipment.package?.weight,
      dimensions: return_shipment.package?.dimensions,
    },
    insurance: {
      declaredValue: return_shipment.insurance?.declaredValue,
    },
  });

  const labelBuffer = await labelBufferOrUndo(labelData);

  try {
    return await withTransaction(async (client) => {
      const updatedOrder = await purchaseOrderRepo.cancelOrderById(
        order.id,
        client
      );
      await purchaseOrderRepo.clearOrderMetals(order.id, client);

      const shipment = await shipmentRepo.create(
        {
          purchase_order_id: order.id,
          // carrier_id: order.carrier.id,
          carrier_id: FEDEX_CARRIER_ID,
          type: "Return",
        },
        client
      );

      const updatedShipment = await shipmentRepo.update(
        {
          ...shipment,
          tracking_number: labelData.tracking_number,
          carrier_id: FEDEX_CARRIER_ID,
          shipping_status: "Label Created",
          shipping_label: labelBuffer,
          label_type: "Generated",
          pickup_type: return_shipment.pickup?.name,
          package: return_shipment.package?.label,
          service_type: return_shipment.service?.serviceDescription,
          net_charge: return_shipment.service?.netCharge,
          insured: return_shipment.insurance?.insured,
          declared_value: return_shipment.insurance?.declaredValue?.amount,
          type: "Return",
        },
        client
      );

      return { updatedOrder, returnShipment: updatedShipment };
    });
  } catch (err) {
    await undoLabel(labelData.tracking_number);
    throw err;
  }
}

export async function updateOfferNotes({
  order,
  offer_notes,
}: {
  order: OrderLike;
  offer_notes: string | null;
}): Promise<unknown> {
  return purchaseOrderRepo.updateOfferNotes(order, offer_notes);
}

export async function createReview({ order }: { order: OrderLike }): Promise<unknown> {
  return purchaseOrderRepo.createReview({ order });
}

// The database half of placing a purchase order, on its own.
//
// Extracted so that exactly one description of what an order IS exists, and
// both the live path and the comparison against features/orders can call it.
// A test that re-listed these calls by hand would be testing a copy of the
// implementation, and would go on passing after the real one changed.
//
// Everything external has already happened by the time this runs - the label
// and the courier are created before the transaction opens - so this is purely
// rows, and it can be run inside a rolled-back transaction with no FedEx
// request being made at all. That is what makes the two paths comparable
// without stubbing a provider.
export async function recordPurchaseOrder(
  client: any,
  {
    purchase_order,
    user_id,
    label = {},
    pickupResult = null,
  }: {
    purchase_order: Record<string, any>;
    user_id: string;
    label?: { tracking_number?: string | null; buffer?: unknown } & Record<string, any>;
    pickupResult?: { confirmationNumber?: string | null; location?: string | null; pickupDate?: unknown } | null;
  }
): Promise<string> {
  const order_id = await purchaseOrderRepo.insertOrder(client, {
    userId: user_id,
    addressId: purchase_order.address.id,
    status: "In Transit",
  });

  await purchaseOrderRepo.insertItems(client, order_id, purchase_order.items);

  // Source of truth: (re)price every scrap item's premium from the rates
  // table, tiered by the total scrap content of each metal on the order.
  // Products keep their own per-product bid_premium. Same helper the admin
  // add-item path uses, so both stay consistent.
  await retierOrderScrapPremiums(order_id, client);

  await purchaseOrderRepo.insertOrderMetals(client, order_id);
  await purchaseOrderRepo.insertRefinerMetals(client, order_id);

  await purchaseOrderRepo.insertPayout(client, order_id, {
    userId: user_id,
    ...purchase_order.payout,
  });

  const shipment = await shipmentRepo.create(
    {
      purchase_order_id: order_id,
      // carrier_id: purchase_order.carrier.id,
      carrier_id: FEDEX_CARRIER_ID,
      type: "Inbound",
    },
    client
  );

  await shipmentRepo.update(
    {
      ...shipment,
      tracking_number: label.tracking_number ?? null,
      carrier_id: FEDEX_CARRIER_ID,
      shipping_status: "Label Created",
      shipping_label: label.buffer ?? null,
      label_type: "Generated",
      pickup_type: purchase_order.pickup?.name ?? null,
      package: purchase_order.package?.label ?? null,
      service_type: purchase_order.service?.serviceDescription ?? null,
      net_charge: purchase_order.service?.netCharge ?? null,
      insured: purchase_order.insurance?.insured ?? false,
      declared_value: purchase_order.insurance?.declaredValue?.amount ?? null,
      type: "Inbound",
    },
    client
  );

  if (pickupResult) {
    await pickupRepo.create(
      {
        user_id,
        order_id: order_id,
        carrier: "FedEx",
        date: purchase_order.pickup.date,
        time: purchase_order.pickup.time,
        pickup_status: "scheduled",
        confirmation_number: pickupResult.confirmationNumber,
        location: pickupResult.location,
      },
      client
    );
  }

  return order_id;
}

// Placing a purchase order: the record, the label, and the courier.
//
// THE LABEL AND THE PICKUP USED TO BE CREATED INSIDE THE TRANSACTION. A failure
// in anything after them - the shipment update, the pickup insert - rolled the
// whole order back while FedEx kept both. The pickup insert in particular threw
// on every call until August 2026 because it named a column the table does not
// have, so choosing "Carrier Pickup" reliably produced exactly that: no order,
// and a label already generated.
//
// The ordering that fixes it without changing what a customer sees is to do the
// external work FIRST and undo it if the database work fails. The alternative -
// commit the order, then create the label - would mean a label failure leaves
// an order the customer was told had failed, and a retry makes a second one.
// This way a label failure is still "nothing happened", exactly as before.
//
// Neither the label nor the pickup depends on anything the transaction writes.
// Both are built entirely out of the request, which is what makes this legal.
export async function createPurchaseOrder(
  purchase_order: Record<string, any>,
  user_id: string
): Promise<PurchaseOrderRow | undefined> {
  const shipper = {
    contact: {
      personName: purchase_order.address.name,
      phoneNumber: purchase_order.address.phone_number,
    },
    address: purchase_order.address,
  };

  const recipient = {
    contact: {
      personName: process.env.FEDEX_DORADO_NAME,
      phoneNumber: process.env.FEDEX_DORADO_PHONE_NUMBER,
    },
    address: FEDEX_STORE_ADDRESS,
  };

  const labelData = await shippingOps.createLabel(
    // purchase_order.carrier.id,
    FEDEX_CARRIER_ID,
    undefined,
    {
      shipper,
      recipient,
      serviceType: purchase_order.service?.serviceType,
      pickupType: purchase_order.pickup?.label,
      pkg: {
        weight: purchase_order.package?.weight,
        dimensions: purchase_order.package?.dimensions,
      },
      insurance: {
        declaredValue: purchase_order.insurance?.declaredValue,
      },
    }
  );

  const buffer = await labelBufferOrUndo(labelData);

  // The courier, if one was asked for. It needs the tracking number, so it
  // cannot happen before the label - and if it fails, the label it was for is
  // undone before the error goes back, so the customer's retry is clean.
  let pickupResult = null;
  if (purchase_order.pickup?.name === "Carrier Pickup") {
    try {
      pickupResult = await shippingOps.createPickup(FEDEX_CARRIER_ID, undefined, {
        pickupContact: {
          personName: purchase_order.address.name,
          phoneNumber: purchase_order.address.phone_number,
        },
        pickupAddress: purchase_order.address,
        pickupDate: purchase_order.pickup.date,
        pickupTime: purchase_order.pickup.time,
        carrierCode: purchase_order.service?.code ?? "FDXE",
        trackingNumber: labelData.tracking_number,
      });
    } catch (err) {
      await undoLabel(labelData.tracking_number);
      throw err;
    }
  }

  let order_id;
  try {
    order_id = await withTransaction((client) =>
      recordPurchaseOrder(client, {
        purchase_order,
        user_id,
        label: { tracking_number: labelData.tracking_number, buffer },
        pickupResult,
      })
    );
  } catch (err) {
    await undoPickup(
      pickupResult && {
        ...pickupResult,
        pickupDate: purchase_order.pickup?.date,
      }
    );
    await undoLabel(labelData.tracking_number);
    throw err;
  }

  return await purchaseOrderRepo.findById(order_id);
}

// A locked-spot offer holds its quoted prices for 24h; an unlocked one floats
// with spot and gets a week.
function offerWindow(order: { spots_locked?: boolean | null }): {
  sentAt: Date;
  expiresAt: Date;
} {
  const now = new Date();
  const hours = order.spots_locked ? 24 : 7 * 24;
  return { sentAt: now, expiresAt: new Date(now.getTime() + hours * 3600 * 1000) };
}

// Clearing prices and the order total invalidates the previous quote, so both
// offer transitions below re-open the offer from a clean slate.
type OfferWindow = { sentAt: Date; expiresAt: Date };

async function reissueOffer(
  order: OrderLike,
  resolveStatus: (order: OrderLike, window: OfferWindow) => Record<string, unknown>
): Promise<unknown> {
  return withTransaction(async (client) => {
    await purchaseOrderRepo.clearItemPrices(client, order.id);
    await purchaseOrderRepo.resetOrderTotal(client, order.id);

    const updated = await purchaseOrderRepo.updateOffer(client, {
      orderId: order.id,
      ...resolveStatus(order, offerWindow(order)),
    });

    if (!updated) {
      const e: Error & { status?: number } = new Error("Purchase Order not found");
      e.status = 404;
      throw e;
    }

    return updated;
  });
}

export async function sendOffer({
  order,
  user_name,
}: {
  order: OrderLike;
  user_name: string;
}): Promise<unknown> {
  return reissueOffer(order, (_order: OrderLike, { sentAt, expiresAt }: OfferWindow) => ({
    sentAt,
    expiresAt,
    offerStatus: "Sent",
    updated_by: user_name,
  }));
}

export async function updateRejectedOffer({
  order,
  user_name,
}: {
  order: OrderLike;
  user_name: string;
}): Promise<unknown> {
  return reissueOffer(order, (o, { sentAt, expiresAt }) => {
    const wasResent = o.offer_status === "Resent";
    return {
      sentAt: wasResent ? null : sentAt,
      expiresAt: wasResent ? null : expiresAt,
      offerStatus: wasResent ? "Rejected" : "Resent",
      updated_by: user_name,
    };
  });
}

export async function updateStatus({
  order,
  order_status,
  user_name,
}: {
  order: OrderLike;
  order_status: string;
  user_name: string;
}): Promise<unknown> {
  return await purchaseOrderRepo.updateStatus(order, order_status, user_name);
}

export async function updateSpot({
  spot,
  updated_spot,
}: {
  spot: OrderMetalRow;
  updated_spot: number;
}): Promise<unknown> {
  return await purchaseOrderRepo.updateSpot({ spot, updated_spot });
}

export async function lockSpots({
  spots,
  purchase_order_id,
}: {
  spots: SpotPriceWire[];
  purchase_order_id: string;
}): Promise<unknown> {
  return withTransaction(async (client) => {
    await purchaseOrderRepo.toggleSpots(true, purchase_order_id, client);
    return await purchaseOrderRepo.updateOrderMetals(
      purchase_order_id,
      spots,
      client
    );
  });
}

export async function unlockSpots({ purchase_order_id }: { purchase_order_id: string }): Promise<unknown> {
  return withTransaction(async (client) => {
    await purchaseOrderRepo.toggleSpots(false, purchase_order_id, client);
    return await purchaseOrderRepo.clearOrderMetals(purchase_order_id, client);
  });
}

export async function toggleOrderItemStatus({
  item_status,
  ids,
  purchase_order_id,
}: {
  // BOOLEAN, not a string. I typed this `string` when converting the service
  // and the compiler caught it the moment the callers were converted too:
  // saveOrderItems passes `true` and resetOrderItems passes `false`, and the
  // repo writes it to exchange.purchase_order_items.confirmed, which is a
  // boolean column. The name reads like a status; the thing is a flag.
  item_status: boolean;
  ids: string[];
  purchase_order_id: string;
}): Promise<unknown> {
  return await purchaseOrderRepo.toggleOrderItemStatus({
    item_status: item_status,
    ids: ids,
    purchase_order_id: purchase_order_id,
  });
}

// Both writes feed the same number - a scrap line is priced at
// content * spot * premium - so applying one without the other quotes a price
// from a mix of the old figures and the new. One transaction.
export async function updateScrapItem({ item }: { item: OrderScrapItemRow & Record<string, any> }): Promise<unknown> {
  return withTransaction(async (client) => {
    await scrapRepo.updateScrapItem({ item }, client);
    return await purchaseOrderRepo.updatePremium(item.id, item.premium, client);
  });
}

// Deleting a line is two deletes and a re-tier, and they have to be one
// transaction.
//
// exchange.purchase_order_items.scrap_id is ON DELETE SET NULL, so if the scrap
// delete commits and the item delete then fails, the scrap rows are gone -
// weights, purity, and the assay figures recording what was actually recovered
// from the customer's parcel - while the order lines survive pointing at
// nothing. The composed order query reports those as item_type 'unknown', and
// what they used to say exists nowhere else.
//
// Undefined is filtered as well as null: `item.scrap?.id` is undefined on a
// bullion line, not null, so the original filter let it through and asked the
// database to delete a row with no id.
export async function deleteOrderItems({
  items,
}: {
  items: {
    id: string;
    scrap?: { id?: string | null } | null;
    purchase_order_id?: string | null;
  }[];
}): Promise<unknown> {
  const ids = items.map((item) => item.id);
  const scrapIds = items
    .map((item) => item.scrap?.id)
    .filter((id) => id != null);
  const orderId = items[0]?.purchase_order_id ?? null;

  return withTransaction(async (client) => {
    if (scrapIds.length) await scrapRepo.deleteItems(scrapIds, client);
    const result = await purchaseOrderRepo.deleteOrderItems(ids, client);

    // Removing scrap changes the per-metal totals, so re-tier the survivors.
    if (orderId) await retierOrderScrapPremiums(orderId, client);

    return result;
  });
}

// Re-resolve every scrap item's premium on an order from the rates table,
// tiered by the total scrap content of each metal on the order. Runs whenever
// the order's scrap composition changes so admin edits stay consistent with
// customer pricing. No-op when there are no rate bands.
export async function retierOrderScrapPremiums(orderId: string, executor?: any): Promise<void> {
  const rates = await ratesRepo.getAllRates();
  if (!rates?.length) return;

  const scrapItems = await purchaseOrderRepo.findOrderScrapItems(orderId, executor);
  const totalsByMetal = sumContentByMetal(
    scrapItems,
    (i: { metal?: unknown; content?: unknown }) => i.metal,
    (i: { metal?: unknown; content?: unknown }) => Number(i.content) || 0
  );

  for (const si of scrapItems) {
    const total = totalsByMetal[String(si.metal ?? "").toLowerCase()] ?? 0;
    const pct = getRatePct(rates, si.metal, total, "scrap");
    if (pct != null) {
      await purchaseOrderRepo.updatePremium(si.id, pct, executor);
    }
  }
}

export async function createOrderItem({
  item,
  purchase_order_id,
}: {
  item: Record<string, any>;
  purchase_order_id: string;
}): Promise<unknown> {
  return withTransaction(async (client) => {
    let scrap_id = null;
    if (!item?.id) {
      scrap_id = await scrapRepo.createNewItem(item, client);
    }

    const updated = await purchaseOrderRepo.createOrderItem(
      item,
      purchase_order_id,
      scrap_id,
      client
    );

    // Admin-added scrap must be priced from rates too — re-tier the whole
    // order so it matches customer checkout (per-metal order total).
    await retierOrderScrapPremiums(purchase_order_id, client);

    return updated;
  });
}

export async function updateBullion({ item }: { item: Record<string, any> }): Promise<unknown> {
  return await purchaseOrderRepo.updateBullion(item);
}

export async function expireStaleOffers(): Promise<void> {
  const expiredOrders = await purchaseOrderRepo.findExpiredOffers();

  for (const order of expiredOrders) {
    try {
      // A locked-spot offer that lapses gets unlocked and re-sent on the
      // floating 7-day window; an unlocked one is accepted at current spot.
      if (!order.spots_locked) {
        await autoAcceptOrder(order.id);
        continue;
      }

      await withTransaction(async (client) => {
        const newSentAt = new Date();
        const newExpiresAt = new Date(
          newSentAt.getTime() + 7 * 24 * 60 * 60 * 1000
        );

        await purchaseOrderRepo.toggleSpots(false, order.id, client);

        await purchaseOrderRepo.updateOffer(client, {
          orderId: order.id,
          sentAt: newSentAt,
          expiresAt: newExpiresAt,
          offerStatus: "Sent",
          updated_by: "Scheduler",
        });

        await purchaseOrderRepo.clearOrderMetals(order.id, client);
      });
    } catch (err) {
      console.error("[CRON] Error expiring offer:", order.id, err);
    }
  }
}

export async function autoAcceptOrder(orderId: string): Promise<void> {
  try {
    await withTransaction(async (client) => {
      const spotPrices = await purchaseOrderRepo.getCurrentSpotPrices(client);

      const updatedSpots = await purchaseOrderRepo.updateOrderMetals(
        orderId,
        spotPrices,
        client
      );

      await purchaseOrderRepo.updateRefinerMetals(orderId, updatedSpots, client);

      const order = await purchaseOrderRepo.findById(orderId, client);

      await purchaseOrderRepo.updateOrderItemPrices(
        orderId,
        order.order_items,
        updatedSpots,
        client
      );

      const total = calculateTotalPrice(order, updatedSpots);

      await purchaseOrderRepo.moveOrderToAccepted(orderId, total, client);
    });
  } catch (err) {
    console.error("[CRON] Failed to auto-accept order", orderId, err);
    throw err;
  }
}

export async function editShippingCharge({
  order_id,
  shipping_charge,
}: {
  order_id: string;
  shipping_charge: number;
}): Promise<unknown> {
  return await purchaseOrderRepo.editShippingCharge(order_id, shipping_charge);
}

export async function editPayoutCharge({
  order_id,
  payout_charge,
}: {
  order_id: string;
  payout_charge: number;
}): Promise<unknown> {
  return await purchaseOrderRepo.editPayoutCharge(order_id, payout_charge);
}

// THE LEDGER NOW RECORDS WHAT WAS ACTUALLY CREDITED.
//
// This credited `order.total_price` and logged `calculateTotalPrice(order,
// spots)` - two different numbers, computed different ways, from a `spots` that
// arrived in the request body. So the entry meant to explain a balance movement
// recorded a different figure from the movement itself.
//
// It shows in production. All NINE Credit entries differ from the total_price of
// the order they name, three of them materially: two at -$219.60 and one at
// -$17.69. CLAUDE.md puts it exactly right - a ledger that disagrees with the
// orders it explains is worse than no ledger.
//
// `spots` is REMOVED from the signature rather than accepted and ignored, the
// same treatment get_sales_tax and createSalesOrder got: a parameter that is
// still accepted is one a future reader will assume still matters.
//
// This does NOT rewrite the nine historical rows. What they should say is a
// business question, and there is a second one beside it - see FOLLOWUPS.md.
export async function addFundsToAccount({ order }: { order: OrderLike }): Promise<void> {
  try {
    await withTransaction(async (client) => {
      await transactionRepo.addFunds(order.user_id, order.total_price, client);
      await transactionRepo.addTransactionLog(
        order.user_id,
        "Credit",
        order.id,
        null,
        order.total_price,
        client
      );
    });
  } catch (err) {
    console.error("Failed to move payments", order.id, err);
    throw err;
  }
}

export async function changePayoutMethod({
  order_id,
  method,
}: {
  order_id: string;
  method: string;
}): Promise<unknown> {
  return await purchaseOrderRepo.changePayoutMethod(order_id, method);
}

export async function purgeCancelled(): Promise<unknown> {
  return await purchaseOrderRepo.purgeCancelled();
}

export async function getRefinerMetalsForOrder(orderId: string): Promise<OrderMetalRow[]> {
  return purchaseOrderRepo.findRefinerMetalsByOrderId(orderId);
}

export async function updateRefinerSpot({
  spot,
  updated_spot,
}: {
  spot: OrderMetalRow;
  updated_spot: number;
}): Promise<unknown> {
  return await purchaseOrderRepo.updateRefinerSpot({ spot, updated_spot });
}

export async function updateRefinerPremium({
  item_id,
  refiner_premium,
}: {
  item_id: string;
  refiner_premium: number;
}): Promise<unknown> {
  return await purchaseOrderRepo.updateRefinerPremium(item_id, refiner_premium);
}

export async function updateShippingActual({
  purchase_order_id,
  shipping_fee_actual,
}: {
  purchase_order_id: string;
  shipping_fee_actual: number;
}): Promise<unknown> {
  return await purchaseOrderRepo.updateShippingActual(
    purchase_order_id,
    shipping_fee_actual
  );
}

export async function updateRefinerFee({
  purchase_order_id,
  refiner_fee,
}: {
  purchase_order_id: string;
  refiner_fee: number;
}): Promise<unknown> {
  return await purchaseOrderRepo.updateRefinerFee(
    purchase_order_id,
    refiner_fee
  );
}

export async function updatePoolOzDeducted({
  purchase_order_id,
  pool_oz_deducted,
}: {
  purchase_order_id: string;
  pool_oz_deducted: number;
}): Promise<unknown> {
  return await purchaseOrderRepo.updatePoolOzDeducted(
    purchase_order_id,
    pool_oz_deducted
  );
}
export async function updatePoolRemediation({
  purchase_order_id,
  pool_remediation,
}: {
  purchase_order_id: string;
  pool_remediation: number;
}): Promise<unknown> {
  return await purchaseOrderRepo.updatePoolRemediation(
    purchase_order_id,
    pool_remediation
  );
}

// Full bank details for one payout. Admin-only, and deliberately a separate
// call so the numbers are not carried by every order response.
export async function getPayoutDetails({ order_id }: { order_id: string }): Promise<unknown> {
  return purchaseOrderRepo.findPayoutDetails(order_id);
}
