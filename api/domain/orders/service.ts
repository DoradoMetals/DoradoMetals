// THE ORDER LIFECYCLE, both directions.
//
// Was features/purchase-orders/service.ts and features/sales-orders/service.ts.
// Direction is a COLUMN, not a feature, so the two live here together - and
// every function that exists in both directions SAYS WHICH ONE IT IS. There is
// no bare `getById` any more, deliberately: a merged file where the unprefixed
// name silently means "purchase" is a trap.
//
// NATIVE ONLY since D212: reads come from read.service.ts and every write
// goes through the owning sub-resource's repo - orders, items, spots,
// transactions, refiners - one generic update per table, patch objects in.
// The dual layer, the mirror and the exchange halves are deleted; git has
// them.

import withTransaction from "#shared/db/withTransaction.ts";
// THE PURGE (D212): every write goes to the new schema through the owning
// sub-resource's repo, one generic update per table, patch objects in. The
// dual layer, the mirror and the exchange halves are gone.
import * as ordersRepo from "#db/orders/repo.ts";
import * as orderItems from "#db/orders/items/repo.ts";
import * as refinerSpots from "#db/refiners/spots/repo.ts";
import * as refinerItems from "#db/refiners/items/repo.ts";
import * as productsRepo from "#db/products/repo.ts";
import * as readService from "#domain/orders/read.service.ts";
import * as payoutAccounts from "#db/payments/details/repo.ts";
import * as orderTransactions from "#db/orders/transactions/repo.ts";
import { convertTroyOz } from "#shared/utils/convertWeights.ts";
import * as emailService from "#domain/media/emails/service.ts";
import * as transactionsService from "#domain/transactions/service.ts";
import * as usersFunds from "#domain/users/service.ts";
import * as ratesRepo from "#domain/rates/service.ts";
import { calculateTotalPrice, calculateItemPrice } from "#domain/pricing/service.ts";
import { getRatePct, sumContentByMetal } from "#domain/rates/utils/resolveRate.ts";

// The SERVICE, not a repo: a shipment is composed from six tables now, and
// the order link it carries is reconstructed rather than stored.
import * as shipmentRepo from "#domain/shipping/shipments/service.ts";
// The SERVICE, not a repo: a pickup hangs off a SHIPMENT now, and the order,
// the user and the carrier it reports are reconstructed through one.
import * as pickupRepo from "#domain/shipping/pickups/service.ts";
import * as shippingOps from "#domain/shipping/operations/handler.ts";
import * as carrierServices from "#domain/shipping/services/service.ts";

import type { ComposedItem as PurchaseOrderItem, ComposedOrder, ComposedSalesOrder } from "#domain/orders/compose.ts";
import type { OrderSpotRow } from "#db/orders/spots/repo.ts";
import type { PricingSpot } from "#domain/pricing/service.ts";

// The API's own assembled shapes - see compose.ts. These were re-exported by
// the mirror until D212 deleted it.
export type PurchaseOrderRow = ComposedOrder;
export type SalesOrderRow = ComposedSalesOrder;
// The per-metal spot row an order carries, in the converted spellings.
type OrderMetalRow = OrderSpotRow;
export type SalesOrderMetalRow = OrderSpotRow;

// `order` here is whatever the caller had - a row from getById, or the body of
// a request. The functions below read a handful of fields off it, and those are
// what this names. It is deliberately not PurchaseOrderRow: several callers are
// controllers handing over req.body.
//
// *** THE MEMBERS BELOW ARE ASSERTIONS, NOT GUARANTEES, AND `payout` IS THE ONE
//     THAT COST SOMETHING. *** `payout: { cost: number }` said a number was
//     always there, about an object that is sometimes `req.body`. Nothing
//     checked it, so `baseTotal - shipping - order.payout.cost` compiled and
//     silently produced NaN for an order whose payout carried no cost - the
//     whole invoice, on a purchase order, which is what a customer is PAID
//     against. features/pricing/bid.ts holds the full account and the fix.
//
//     Narrowed to what the data can be. `payout` is a LEFT JOIN, and the
//     composed read gives an absent one an all-null object (compose.ts's
//     EMPTY_PAYOUT), so both `null` and a null `cost` are real states of a real
//     order. A type that admits them is what makes the compiler able to see the
//     next one of these.
type OrderLike = PurchaseOrderRow &
  Record<string, any> & {
    order_items: PurchaseOrderItem[];
    shipment?: { shipping_charge?: number | null } | null;
    payout?: { cost?: number | null } | null;
  };

import {
  DORADO_ADDRESS,
  FEDEX_STORE_ADDRESS,
  FEDEX_CARRIER_ID,
} from "#providers/shipments/constants.ts";
// TO DO - COMES FROM DATABASE

import { auth } from "#domain/auth/client.ts";
import { fromNodeHeaders } from "better-auth/node";
import * as salesOrderWrites from "#domain/orders/write.service.ts";
import * as orderSpots from "#db/orders/spots/repo.ts";
import * as metalsRepo from "#db/metals/repo.ts";
import { calculateItemAsk } from "#domain/pricing/service.ts";
import * as stripeRepo from "#db/payments/repo.ts";
import * as stripeProvider from "#providers/payment/stripe.ts";
import * as reconcileService from "#domain/orders/reconcile.service.ts";
import * as usersService from "#domain/users/service.ts";
// The SERVICE, not a repo: a shipment is composed from six tables now, and
// the order link it carries is reconstructed rather than stored.
import * as refinerRepo from "#domain/refiners/service.ts";
import * as addressService from "#domain/places/addresses/service.ts";
import * as taxService from "#domain/sales-tax/service.ts";
import * as spotsService from "#domain/spots/service.ts";
import * as productService from "#domain/products/service.ts";
import { calculateSalesOrderTotal } from "#domain/pricing/service.ts";

import type { PoolClient } from "pg";
import type { Executor } from "#shared/db/executor.ts";
import { reportError } from "#shared/observability/report.ts";
import type { PaymentSession } from "#domain/payments/service.ts";
import type { IncomingHttpHeaders } from "node:http";
import type { Transport } from "#providers/emails/nodemailer.ts";

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
export async function undoLabel(trackingNumber: string | undefined | null): Promise<void> {
  if (!trackingNumber) return;
  try {
    await shippingOps.cancelLabel(FEDEX_CARRIER_ID, undefined, { trackingNumber });
  } catch (err) {
    reportError({
      at: "orders.undoLabel",
      message:
        `ORPHANED SHIPPING LABEL ${trackingNumber}: the order it belonged to was ` +
        `rolled back and cancelling the label failed too`,
      err,
      extra: { trackingNumber },
    });
  }
}

export async function undoPickup(
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
    reportError({
      at: "orders.undoPickup",
      message:
        `ORPHANED CARRIER PICKUP ${pickup.confirmationNumber}: the order it ` +
        `belonged to was rolled back and cancelling the pickup failed too`,
      err,
      extra: { confirmationNumber: pickup.confirmationNumber },
    });
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

export async function listPurchasesForUser(userId: string): Promise<PurchaseOrderRow[]> {
  return (await readService.findPurchasesByUser(userId)) as unknown as PurchaseOrderRow[];
}

export async function getPurchaseById(orderId: string): Promise<PurchaseOrderRow | undefined> {
  return ((await readService.findPurchaseById(orderId)) ?? undefined) as unknown as
    PurchaseOrderRow | undefined;
}

export async function getAllPurchases(): Promise<PurchaseOrderRow[]> {
  return (await readService.getAllPurchases()) as unknown as PurchaseOrderRow[];
}

export async function getPurchaseMetalsForOrder(orderId: string): Promise<OrderMetalRow[]> {
  return orderSpots.getFor(orderId);
}

// ONE UPDATE for the orders row (Jacob, 2026-09-02): callers pass the patch,
// the repo builds the statement. Status labels, flags, notes - all of it.
export async function update(
  order_id: string, patch: Parameters<typeof ordersRepo.update>[1], executor?: Executor
): Promise<{ id: string } | undefined> {
  return await ordersRepo.update(order_id, patch, {}, executor);
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
      // The body's address speaks the snapshot shape now (D84):
      // recipient_name is who receives the parcel - the field the old smeared
      // `name` actually was.
      personName: return_shipment.address.recipient_name,
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
      // No status write. This called cancelOrderById, which set
      // purchase_order_status = 'Cancelled' on the way through - and statuses
      // are labels now, never side effects (Jacob, 28 August). What remains
      // of that statement is the spot unpin; the 'Cancelled' label is the
      // admin's own explicit status write, which the PATCH runs LAST so a
      // cancel-and-label document still labels after the pipeline succeeds.
      await ordersRepo.update(order.id, { spots_locked: false }, {}, client);
      await orderSpots.clearBids(order.id, client);

      const shipment = await shipmentRepo.create(
        {
          purchase_order_id: order.id,
          // carrier_id: order.carrier.id,
          carrier_id: FEDEX_CARRIER_ID,
          type: "Return",
        },
        client
      );

      // create() returns null only if the row vanished between the insert and
      // the read back, which cannot happen inside this transaction - but the
      // type admits it, so the id is taken explicitly rather than spread.
      if (!shipment) throw new Error("the return shipment was not created");
      const updatedShipment = await shipmentRepo.update(
        {
          ...shipment,
          id: shipment.id,
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

      return { returnShipment: updatedShipment };
    });
  } catch (err) {
    await undoLabel(labelData.tracking_number);
    throw err;
  }
}

export async function createPurchaseReview({ order }: { order: OrderLike }): Promise<unknown> {
  return await ordersRepo.update(order.id, { review_created: true });
}

// createPurchaseOrder - the composed create - died with the stepper
// conversion (D208/D209): features/orders/create.ts places orders from the
// checkout row now. recordPurchaseOrder died with the dual layer (D212); the
// seed primes a checkout row and calls the same create.ts flow the live path
// runs. The label helpers stay exported for the live flow and the
// return-shipment path.


// Finalizing an order's pricing is a PRICING event, and ONLY that now. The
// spots are snapshotted (or kept, if already pinned), the refiner's copies
// updated, every line priced from them, and the total written with the pin in
// one transaction. 086 removed the offer record this used to update alongside.
//
// This was acceptOrder, and it also moved the status to 'Accepted'. That half
// is GONE (Jacob, 28 August: "The stages don't really matter for admins...
// They shouldn't be driving logic AT ALL"): a status is a label the admin
// writes deliberately, and no status write triggers a pipeline. 'Accepted'
// itself left the lifecycle in migration 092. ADMIN-ONLY - pricing decides
// what the business pays.
export async function finalizePricing({
  order,
  order_spots,
  spot_prices,
}: {
  order: OrderLike;
  // The spot arrays speak the converted names (`name` / `ask` / `bid`) since
  // D84; frozen order-spot rows carry more, and only these are read. Both are
  // resolved SERVER-side by the PATCH dispatch - the request supplies nothing
  // but the operation's name.
  order_spots: PricingSpot[];
  spot_prices: PricingSpot[];
}): Promise<{ purchaseOrder: PurchaseOrderRow | undefined; orderSpots: PricingSpot[] }> {
  const updatedSpots = await withTransaction(async (client) => {
    const idByName = await metalsRepo.idsByName(client);
    const metalId = (name: unknown): string | undefined => idByName.get(String(name ?? ""));

    let spots: PricingSpot[];
    if (order.spots_locked) {
      spots = order_spots;
    } else {
      for (const sp of spot_prices) {
        const metal_id = metalId(sp.name);
        if (metal_id) await orderSpots.setBid(order.id, metal_id, sp.bid ?? null, client);
      }
      spots = await orderSpots.getFor(order.id, client);
    }

    // The refiner's copies, keyed the same way.
    for (const sp of spots) {
      const metal_id = metalId(sp.name);
      if (metal_id) await refinerSpots.update(order.id, metal_id, { bid: sp.bid ?? null }, client);
    }

    for (const item of order.order_items) {
      await orderItems.setPrice(item.id, order.id, calculateItemPrice(item, spots) ?? null, client);
    }

    // The total, and the PIN - pricing an order freezes the spots it was
    // priced at, which is what the exchange statement always did in one row.
    const total = calculateTotalPrice(order, spots);
    await orderTransactions.update(order.id, { total }, {}, client);
    await ordersRepo.update(order.id, { spots_locked: true }, {}, client);

    return spots;
  });

  const purchaseOrder = await getPurchaseById(order.id);
  return { purchaseOrder, orderSpots: updatedSpots };
}

export async function updatePurchaseStatus({
  order,
  order_status,
  user_name,
}: {
  order: OrderLike;
  order_status: string;
  user_name: string;
}): Promise<unknown> {
  return await ordersRepo.update(order.id, { status: order_status, updated_by: user_name });
}

export async function updateSpot({
  spot,
  updated_spot,
}: {
  spot: OrderMetalRow;
  updated_spot: number;
}): Promise<unknown> {
  const idByName = await metalsRepo.idsByName();
  const metal_id = idByName.get(String(spot.name ?? ""));
  if (!metal_id) return undefined;
  return await orderSpots.setBid(spot.purchase_order_id as string, metal_id, updated_spot);
}

export async function lockSpots({
  spots,
  purchase_order_id,
}: {
  spots: PricingSpot[];
  purchase_order_id: string;
}): Promise<unknown> {
  return withTransaction(async (client) => {
    await ordersRepo.update(purchase_order_id, { spots_locked: true }, {}, client);
    const idByName = await metalsRepo.idsByName(client);
    for (const sp of spots) {
      const metal_id = idByName.get(String(sp.name ?? ""));
      if (metal_id) await orderSpots.setBid(purchase_order_id, metal_id, sp.bid ?? null, client);
    }
    return await orderSpots.getFor(purchase_order_id, client);
  });
}

export async function unlockSpots({ purchase_order_id }: { purchase_order_id: string }): Promise<unknown> {
  return withTransaction(async (client) => {
    await ordersRepo.update(purchase_order_id, { spots_locked: false }, {}, client);
    return await orderSpots.clearBids(purchase_order_id, client);
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
  return await orderItems.setConfirmed(purchase_order_id, ids, item_status);
}

// The declared weights land on orders.items, the assay actuals on
// refiners.items, and the premium on the line - a scrap line is priced at
// content * spot * premium, so applying one without the others quotes a price
// from a mix of the old figures and the new. One transaction.
//
// content is computed HERE, as it always was: convertTroyOz(...) * purity,
// with NaN stored as NULL ("not measured") rather than reaching the database -
// see orders/items/sql/update_scrap.sql and D47/D65 for the full account.
export async function updateScrapItem({ item }: { item: Record<string, any> }): Promise<unknown> {
  const s = (item.scrap ?? {}) as Record<string, any>;
  const finiteOrNull = (n: number): number | null => (Number.isFinite(n) ? n : null);

  const content = finiteOrNull(
    convertTroyOz((s.post_melt ?? s.pre_melt) as number, s.gross_unit as string) *
      (s.purity as number)
  );
  const purity_actual = s.purity_actual ?? s.purity ?? null;
  const post_melt_actual = s.post_melt_actual ?? s.post_melt ?? null;
  const content_actual = finiteOrNull(
    convertTroyOz((s.post_melt_actual ?? s.pre_melt) as number, s.gross_unit as string) *
      (purity_actual as number)
  );

  return withTransaction(async (client) => {
    await orderItems.updateScrap(
      item.id,
      {
        pre_melt: s.pre_melt ?? null,
        post_melt: s.post_melt ?? null,
        purity: s.purity ?? null,
        content,
      },
      client
    );
    await refinerItems.update(
      item.id,
      {
        pre_melt: s.pre_melt ?? null,
        post_melt: post_melt_actual,
        purity: purity_actual,
        content: content_actual,
      },
      client
    );
    return await orderItems.setPremium(item.id, item.premium ?? null, client);
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
  const orderId = items[0]?.purchase_order_id ?? null;
  if (!orderId) {
    const err: Error & { statusCode?: number } = new Error(
      "the lines to delete name no order - refusing an unguarded delete"
    );
    err.statusCode = 400;
    throw err;
  }

  return withTransaction(async (client) => {
    // The scrap IS the line in the new schema, and refiners.items cascades on
    // the line's delete - one guarded statement where exchange had three.
    const result = await orderItems.removeFromOrder(orderId, ids, client);

    // Removing scrap changes the per-metal totals, so re-tier the survivors.
    await retierOrderScrapPremiums(orderId, client);

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

  const scrapItems = await orderItems.scrapLinesFor(orderId, executor);
  const totalsByMetal = sumContentByMetal(
    scrapItems,
    (i: { metal?: unknown; content?: unknown }) => i.metal,
    (i: { metal?: unknown; content?: unknown }) => Number(i.content) || 0
  );

  for (const si of scrapItems) {
    const total = totalsByMetal[String(si.metal ?? "").toLowerCase()] ?? 0;
    const pct = getRatePct(rates, si.metal, total, "scrap");
    if (pct != null) {
      await orderItems.setPremium(si.id, pct, executor);
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
    const refuse = (statusCode: number, message: string): never => {
      const err: Error & { statusCode?: number } = new Error(message);
      err.statusCode = statusCode;
      throw err;
    };

    let created;
    if (item?.id) {
      // An existing product: the line derives its weights from the catalogue -
      // pre_melt from gross, post_melt/content from content - exactly the
      // derivation the mirror used to make. The premium stays null; a bullion
      // line prices from its product's own bid_premium.
      const [product] = await productsRepo.getByIds([String(item.id)], client);
      if (!product) refuse(400, `no product ${String(item.id)} to put on the order`);
      if (!product.metal_id) {
        refuse(422, `product ${product.name} has no metal, so its order line cannot be written`);
      }
      created = await orderItems.create(
        {
          order_id: purchase_order_id,
          bullion_id: product.id,
          metal_id: product.metal_id as string,
          pre_melt: product.gross ?? null,
          post_melt: product.content ?? null,
          purity: product.purity ?? null,
          content: product.content ?? null,
          quantity: 1,
          confirmed: false,
          unit: "t oz",
        },
        client
      );
    } else {
      // New scrap: the scrap IS the line in the new schema. Metal resolved by
      // name once; the defaults are the ones the exchange scrap insert used.
      const idByName = await metalsRepo.idsByName(client);
      const metal_id = idByName.get(String(item?.metal ?? ""));
      if (!metal_id) refuse(422, `"${String(item?.metal)}" is not a metal this business trades`);
      const pre_melt = item.pre_melt ?? 1;
      const purity = item.purity ?? 1;
      created = await orderItems.create(
        {
          order_id: purchase_order_id,
          metal_id: metal_id as string,
          pre_melt,
          purity,
          content: item.content ?? pre_melt * purity,
          premium: item.bid_premium ?? 0.75,
          quantity: 1,
          confirmed: false,
          unit: item.gross_unit ?? "t oz",
        },
        client
      );
    }

    // The refiner counterpart, one per line, idempotent (093's rule applied to
    // new lines).
    await refinerItems.mirrorLinesForOrder(purchase_order_id, client);

    // Admin-added scrap must be priced from rates too — re-tier the whole
    // order so it matches customer checkout (per-metal order total).
    await retierOrderScrapPremiums(purchase_order_id, client);

    return created;
  });
}

export async function updateBullion({ item }: { item: Record<string, any> }): Promise<unknown> {
  return await orderItems.setBullion(item.id, item.quantity ?? null, item.premium ?? null);
}

// autoAcceptOrder IS GONE. It was the auto-accept cron's pipeline, and no
// cron - nothing at all - called it: the scheduler never named it, so it was
// an exported pipeline with no caller whose one distinguishing act was
// writing 'Accepted', the status migration 092 retires. Dead code that
// reintroduces a retired label is exactly what to delete rather than keep
// against a future that would have to rebuild it differently anyway
// (finalizePricing is the pipeline a future auto-finalize would call).

export async function editShippingCharge({
  order_id,
  shipping_charge,
}: {
  order_id: string;
  shipping_charge: number;
}): Promise<unknown> {
  // NOT purchaseOrderRepo. shipping.shipments belongs to features/shipping, and
  // this used to be a raw UPDATE against exchange.shipments from here - the
  // second writer to a table another feature already dual-writes (D41).
  //
  // Calling the shipments service means this column starts landing in both
  // schemas now, before the purchase-orders pivot rather than after. That is
  // safe while the switch is still `exchange`: the new-schema half is an
  // UPDATE that matches nothing when the backfill has not yet created the
  // shipment, which is a no-op, and reads still come from exchange either way.
  return await shipmentRepo.setChargeForOrder(order_id, shipping_charge);
}

// The payout fee, its waiver and the payout method left for features/payouts
// (D212): they were exchange-half wrappers here, and the native columns they
// write - orders.transactions.payout_fee / waive_payout_fee and
// payments.details.method - belong to the features that own those tables.

// THE LEDGER NOW RECORDS WHAT WAS ACTUALLY CREDITED.
//
// This credited the order's stored total and logged `calculateTotalPrice(order,
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
      await usersFunds.addFunds(order.user_id, order.totals?.total ?? null, client);
      await transactionsService.addTransactionLog(
        order.user_id,
        "Credit",
        order.id,
        null,
        order.totals?.total ?? null,
        client
      );
    });
  } catch (err) {
    console.error("Failed to move payments", order.id, err);
    throw err;
  }
}

export async function getRefinerMetalsForOrder(orderId: string): Promise<OrderMetalRow[]> {
  return refinerSpots.getNamed(orderId);
}

export async function updateRefinerSpot({
  spot,
  updated_spot,
}: {
  spot: OrderMetalRow;
  updated_spot: number;
}): Promise<unknown> {
  const idByName = await metalsRepo.idsByName();
  const metal_id = idByName.get(String(spot.name ?? ""));
  if (!metal_id) return undefined;
  return await refinerSpots.update(spot.purchase_order_id as string, metal_id, { bid: updated_spot });
}

// updateRefinerPremium and updateShippingActual left with the purge (D212):
// the callers write refiners.items.premium and
// orders.transactions.shipping_fee_actual through those tables' own repos.
// updateRefinerFee and the two pool writes had NO caller at all - exchange
// columns whose admin surface never survived the drawer rework - and dead
// code goes first.

// getPayoutDetails left with the read flip: the full bank numbers are
// GET /payouts/:id/details now, owned by features/payouts, payout-keyed, and
// the radioactive rule is unchanged - details only there, never on an order.

// ===========================================================================
// THE SALE DIRECTION
// ===========================================================================
// The order as the browser sends it. This is req.body, so every field is
// whatever arrived - which is the point of re-fetching the items and the
// address by id, and of pricing against the server's spots rather than these.
type SalesOrderInput = {
  address: { id: string };
  items: { id: string; quantity: number }[];
  using_funds?: boolean | null;
  // BOTH FIELDS ARE REAL, and the type said only one. `value` is what the tax
  // and total calculations read; `label` is what gets stored as the order's
  // shipping_service - dev holds "Standard" and "Free" from exactly this path,
  // so it has always been present and the declaration was simply short.
  // Found by the compiler when the write moved to a typed service.
  service: { value?: string | null; label?: string | null };
  payment_method?: string | null;
};

// THE LINES AND THE QUOTED SPOTS, written to both schemas.
//
// Two things the caller has to supply because only it holds them: the PRICE of
// each line, which calculateItemAsk derives from the quote, and the metal id
// for each quoted metal, because exchange keys a spot by NAME and the new
// schema by id. Resolving the names once here beats a lookup per row.
//
// A line's metal comes from its PRODUCT - a sale is always bullion - so a
// product whose metal cannot be resolved would write a null into a NOT NULL
// column. It is refused by name instead.
async function insertLines(
  client: PoolClient,
  orderId: string,
  items: Parameters<typeof salesOrderWrites.insertSalesItems>[2],
  spot_prices: Parameters<typeof salesOrderWrites.insertSalesOrderMetals>[1]
): Promise<void> {
  const metals = await metalsRepo.getAll(client);
  const idByName = new Map(metals.map((m) => [m.name, m.id]));

  await salesOrderWrites.insertSalesItems(
    client,
    orderId,
    items,
    (item) => calculateItemAsk(item as never, spot_prices as never),
    (item) => {
      // *** STOREFRONT ITEMS CARRY THE NAME, NOT THE ID, and this resolver
      // read only the id - so every customer order 422ed here. ***
      // compose.storefront() destructures metal_id OUT of the row at runtime
      // and exposes metal_type (the name) instead; getItemsFromServer is the
      // storefront projection; so `item.metal_id` was null for every item the
      // customer flow can produce. idByName was built two lines up for the
      // spots and is exactly the lookup this needed. The id is still preferred
      // when a caller supplies one.
      const it = item as { metal_id?: string | null; metal_type?: string | null };
      const metal_id =
        it.metal_id ?? (it.metal_type ? idByName.get(it.metal_type) ?? null : null);
      if (!metal_id) {
        const err: Error & { statusCode?: number } = new Error(
          `product ${String(item.id)} has no metal, so its order line cannot be written`
        );
        err.statusCode = 422;
        throw err;
      }
      return metal_id;
    }
  );

  await salesOrderWrites.insertSalesOrderMetals(
    orderId, spot_prices, (name) => idByName.get(name), client
  );
}

export async function getSaleById(orderId: string): Promise<SalesOrderRow | undefined> {
  return (await readService.findSaleById(orderId)) as unknown as SalesOrderRow;
}

export async function listSalesForUser(userId: string): Promise<SalesOrderRow[]> {
  return (await readService.findSalesByUser(userId)) as unknown as SalesOrderRow[];
}

export async function getAllSales(): Promise<SalesOrderRow[]> {
  return (await readService.getAllSales()) as unknown as SalesOrderRow[];
}

export async function getSalesMetalsForOrder(orderId: string): Promise<SalesOrderMetalRow[]> {
  return (await orderSpots.getFor(orderId)) as unknown as SalesOrderMetalRow[];
}

// SPOT PRICES COME FROM THE SERVER, NOT FROM THE BODY.
//
// `spot_prices` used to arrive in the request and decide what the order was
// worth. Items were already re-fetched with getItemsFromServer and the address
// loaded by id, so the product could not be faked - but the price of the metal
// could, and it is the larger number. An order priced with ask_spot 1 recorded
// a total of $26.81 for an ounce of gold, and the payment intent agreed with
// it, so nothing downstream looked wrong.
//
// The order is now priced at what the business holds at the moment it is
// placed. That is a real behaviour change and worth knowing: if spot moves
// between the customer loading the page and confirming, the recorded total is
// the newer one. A quote held for a few minutes is the proper answer and is
// written up in FOLLOWUPS; it needs a table, and the schema is mid-migration.
// THE ADDRESS IS A ROW, NOT A LIST OF THEM.
//
// This read `addressRepo.getFromId(...)`, which returns `rows`, and then took
// `.state` off it - which on an array is `undefined`. Both uses below are the
// taxing state: one decides what the customer is charged, the other credits
// the state's liability. Taxed in no state at all, the rules match nothing and
// COALESCE to a rate of zero, silently.
//
// It arrived in cf724c4e, "fix sales order bug", 6 January 2026, which replaced
// addressService.getAddressFromId - deleted in the December feature-slicing -
// with the repo call. The same deletion left update_payment_intent answering
// 500 for eight months (cf5a94eb). One call site was left broken; this one was
// "fixed" into something quieter.
//
// features/orders/tests/address-state.test.ts proves both halves.
export async function createSalesOrder(
  { sales_order, payment_intent_id }: { sales_order: SalesOrderInput; payment_intent_id: string },
  headers: IncomingHttpHeaders
): Promise<SalesOrderRow | undefined> {
  // BOTH OF THESE WERE READ UNGUARDED, AND BOTH ARE 500s WHEN THEY ARE ABSENT.
  //
  // The session is used four times below - insertOrder, removeFunds and the
  // ledger entry all take session.user.id. requireUser has already run, so this
  // fires only when auth.api.getSession, a second and independent lookup,
  // disagrees with it. 401 rather than the TypeError's 500: a missing session
  // is an authentication fact, not a server fault.
  //
  // The address is looked up by id from the body, so an id that does not exist
  // - or belongs to somebody else - returned undefined and threw on
  // `address.state`. 400: the request named an address the server cannot find.
  const session = (await auth.api.getSession({
    headers: fromNodeHeaders(headers),
  })) as PaymentSession | null;
  if (!session?.user?.id) {
    const err: Error & { statusCode?: number } = new Error(
      "no session - an order cannot be placed without one"
    );
    err.statusCode = 401;
    throw err;
  }

  const address = await addressService.getAddressFromId(sales_order.address.id);
  if (!address) {
    const err: Error & { statusCode?: number } = new Error(
      `no address ${sales_order.address.id}`
    );
    err.statusCode = 400;
    throw err;
  }
  const serverItems = await productService.getItemsFromServer(
    sales_order.items
  );
  const spot_prices = await spotsService.getSpotPrices();
  const items = await taxService.attachSalesTaxToItems(
    address.state,
    serverItems,
    spot_prices
  );

  // *** CREATE-THEN-CHARGE (phase 9). THE ORDER NOW EXISTS BEFORE ANY MONEY
  // MOVES, and everything below is arranged around that inversion. *** The old
  // flow confirmed the charge in the browser and posted here afterwards, so a
  // failure between the two left a paid customer with no order (D179). Now this
  // endpoint runs FIRST, the browser confirms the intent AFTERWARDS, and the
  // payment_intent.succeeded webhook - with reconcile:payments behind it -
  // advances the order when the money actually arrives.
  //
  // Pricing is pure, so it moves out of the transaction: the intent
  // verification below needs the number before anything is written.
  const orderPrices = calculateSalesOrderTotal(
    items,
    sales_order.using_funds,
    spot_prices,
    session.user,
    sales_order.service.value,
    sales_order.payment_method
  );
  const chargeCents = Math.round(orderPrices.post_charges_amount * 100);

  // *** THE INTENT IS VERIFIED, WHERE IT USED TO BE TRUSTED. *** The old code
  // attached whatever payment_intent_id the body named - never checking whose
  // it was, what state it was in, or what amount it carried. Behind
  // requireAdmin that was survivable; the whole point of this flow is that the
  // route reopens to customers, and then an unverified id is an order paid for
  // by somebody else's intent, or by nothing.
  let intentAlreadySucceeded = false;
  if (chargeCents > 0) {
    if (chargeCents < 50) {
      // Stripe's floor is $0.50 and pricing caps applied credit so a card
      // remainder is either 0 or >= that (ask.ts). Reaching here means a
      // sub-50-cent ORDER, which no product this business sells can produce.
      const err: Error & { statusCode?: number } = new Error(
        "the amount left to charge is below Stripe's $0.50 minimum"
      );
      err.statusCode = 422;
      throw err;
    }
    if (typeof payment_intent_id !== "string" || payment_intent_id.length === 0) {
      const err: Error & { statusCode?: number } = new Error(
        "this order has a card charge and no payment intent was named"
      );
      err.statusCode = 400;
      throw err;
    }
    const intent = await stripeRepo.getVerbatimByIntentId(payment_intent_id);
    if (!intent || intent.user_id !== session.user.id) {
      // "does not exist" and "is not yours" are deliberately the same answer,
      // exactly as the ownership middleware phrases it.
      const err: Error & { statusCode?: number } = new Error(
        "that payment intent does not exist"
      );
      err.statusCode = 403;
      throw err;
    }
    if (intent.sales_order_id || intent.purchase_order_id) {
      // *** A CUSTOMER'S OWN ABANDONED CHECKOUT IS SUPERSEDED, NOT REFUSED. ***
      // The intent is opened per session and REUSED until it settles, so a
      // customer who created an order, closed the laptop before confirming,
      // and came back arrives here with their intent still attached to the
      // old Pending order. Refusing would strand exactly the person trying to
      // give the business money until the abandonment sweep clears it. So:
      // their own still-Pending sale is cancelled (credit refunded, ledger
      // entry - the reconciler's own helper), the intent detached, and
      // creation proceeds. Anything else attached - a paid order, a purchase,
      // somebody else's - is a real conflict and refuses.
      // Whether the old order may be superseded is the INTENT's own payment
      // fact (D211), never a label: a settled intent stays with the order it
      // paid for, an unsettled one paid for nothing and its sale is
      // superseded - credit refunded by the ledger-guarded helper, intent
      // detached, creation proceeds.
      const settled =
        intent.payment_status === "succeeded" || intent.payment_status === "processing";
      if (intent.purchase_order_id || settled) {
        const err: Error & { statusCode?: number } = new Error(
          `that payment intent already belongs to an order`
        );
        err.statusCode = 409;
        throw err;
      }
      await withTransaction(async (client) => {
        await reconcileService.cancelPendingSale(
          intent.sales_order_id as string, "superseded-by-retry", client
        );
        await stripeRepo.attachOrder(payment_intent_id, null, null, client);
      });
    }
    if (intent.payment_status === "canceled") {
      const err: Error & { statusCode?: number } = new Error(
        "that payment intent was cancelled - start checkout again"
      );
      err.statusCode = 409;
      throw err;
    }

    // A succeeded, UNATTACHED intent is the D179 wreckage arriving to be
    // repaired: the customer paid, the order-creation half failed, and they
    // are retrying. The money is real, so the order is born paid - PROVIDED
    // the amount still matches what this cart prices at. If spots have moved
    // since the charge, refuse rather than guess; the message carries the
    // intent id because support will need it.
    if (intent.payment_status === "succeeded" || intent.payment_status === "processing") {
      if (Number(intent.amount) !== chargeCents) {
        const err: Error & { statusCode?: number } = new Error(
          `payment ${payment_intent_id} was taken at a different price than ` +
          `this cart totals now - contact support with that reference`
        );
        err.statusCode = 409;
        throw err;
      }
      intentAlreadySucceeded = intent.payment_status === "succeeded";
    } else {
      // The normal path: an open intent, about to be confirmed by the browser
      // AFTER this returns. The server sets the authoritative amount NOW -
      // outside the transaction, because a Stripe call does not belong inside
      // one - so what the customer confirms is exactly what the server priced,
      // whatever the intent carried before (this is also what buried the $10
      // placeholder floor, D199).
      const updated = await stripeProvider.updateIntent(payment_intent_id, {
        amount: chargeCents,
      });
      await stripeRepo.updatePaymentIntent(updated);
    }
  }

  const orderId = await withTransaction(async (client) => {
    // *** THE LABEL DERIVES FROM A MONEY FACT, not the method string. ***
    // Nothing left to charge - full credit, whatever the method was called -
    // means there is nothing to await and the order is born Preparing; the old
    // `payment_method === "CREDIT"` check got exactly that edge wrong. An
    // order with a charge outstanding is born Pending, WHICH NOW MEANS
    // AWAITING PAYMENT: the webhook advances it the moment the money lands.
    const orderId = await salesOrderWrites.insertSalesOrder(client, {
      user: session.user,
      status: chargeCents > 0 && !intentAlreadySucceeded ? "Pending" : "Preparing",
      sales_order: sales_order,
      orderPrices,
    });

    if (sales_order.using_funds === true) {
      // Credit is RESERVED at creation - before the card half settles - so the
      // same dollars cannot be spent twice while an order awaits payment. If
      // the payment never arrives, reconcile:payments cancels the order and
      // puts these back, with its own ledger entry.
      await usersService.removeFunds(
        session.user.id,
        orderPrices.pre_charges_amount,
        client
      );
      await transactionsService.addTransactionLog(
        session.user.id,
        "Debit",
        null,
        orderId,
        orderPrices.pre_charges_amount,
        client
      );
    }

    await insertLines(client, orderId, items, spot_prices);

    await taxService.updateStateSalesTax(
      orderPrices.sales_tax,
      address.state,
      client
    );

    if (chargeCents > 0) {
      await stripeRepo.attachOrder(payment_intent_id, null, orderId, client);
    }

    return orderId;
  });

  return await getSaleById(orderId);
}

export async function adminCreateSalesOrder({
  sales_order,
  payment_intent_id,
  user,
}: {
  sales_order: SalesOrderInput;
  payment_intent_id: string;
  user: { id: string; dorado_funds?: number | null };
}): Promise<SalesOrderRow | undefined> {
  const address = await addressService.getAddressFromId(sales_order.address.id);
  if (!address) {
    const err: Error & { statusCode?: number } = new Error(
      `no address ${sales_order.address.id}`
    );
    err.statusCode = 400;
    throw err;
  }
  const serverItems = await productService.getItemsFromServer(
    sales_order.items
  );
  // Server-sourced here too. An admin placing an order on a customer's behalf
  // is still an order, and the same argument applies - more so, since this path
  // has no Stripe confirmation to disagree with it.
  const spot_prices = await spotsService.getSpotPrices();
  const items = await taxService.attachSalesTaxToItems(
    address.state,
    serverItems,
    spot_prices
  );
  // Pricing is pure, so it lives outside the transaction: the intent
  // verification below needs the number before anything is written.
  const orderPrices = calculateSalesOrderTotal(
    items,
    sales_order.using_funds,
    spot_prices,
    user,
    sales_order.service.value,
    sales_order.payment_method
  );
  const chargeCents = Math.round(orderPrices.post_charges_amount * 100);

  // *** THE INTENT IS VERIFIED AND STAMPED, WHERE IT USED TO BE TRUSTED ***
  // (D206 - the admin path joins create-then-charge). The old ordering charged
  // first and created after, so this function could assume a settled intent;
  // under the shared form the order is created AWAITING PAYMENT and the
  // browser confirms afterwards, which makes this the last place the server
  // can check whose intent this is and set the authoritative amount - exactly
  // as createSalesOrder does for the customer path.
  let intentAlreadySucceeded = false;
  if (chargeCents > 0) {
    if (chargeCents < 50) {
      const err: Error & { statusCode?: number } = new Error(
        "the amount left to charge is below Stripe's $0.50 minimum"
      );
      err.statusCode = 422;
      throw err;
    }
    if (typeof payment_intent_id !== "string" || payment_intent_id.length === 0) {
      const err: Error & { statusCode?: number } = new Error(
        "this order has a card charge and no payment intent was named"
      );
      err.statusCode = 400;
      throw err;
    }
    const intent = await stripeRepo.getVerbatimByIntentId(payment_intent_id);
    // Ownership is the NAMED CUSTOMER's, not the admin's: admin-flavoured
    // intents are keyed on the customer they are opened for.
    if (!intent || intent.user_id !== user.id) {
      const err: Error & { statusCode?: number } = new Error(
        "that payment intent does not exist"
      );
      err.statusCode = 403;
      throw err;
    }
    if (intent.purchase_order_id) {
      const err: Error & { statusCode?: number } = new Error(
        "that payment intent already belongs to an order"
      );
      err.statusCode = 409;
      throw err;
    }
    if (intent.payment_status === "canceled") {
      const err: Error & { statusCode?: number } = new Error(
        "that payment intent was cancelled - reopen the drawer to mint a fresh one"
      );
      err.statusCode = 409;
      throw err;
    }
    if (intent.payment_status === "succeeded" || intent.payment_status === "processing") {
      // A settled intent stays with the order it paid for; only an UNATTACHED
      // one is the D179 wreckage arriving to be repaired - the charge landed,
      // creation failed, and the admin is retrying. Born paid, PROVIDED the
      // amount still matches what this cart prices at now.
      if (intent.sales_order_id) {
        const err: Error & { statusCode?: number } = new Error(
          "that payment intent already belongs to an order"
        );
        err.statusCode = 409;
        throw err;
      }
      if (Number(intent.amount) !== chargeCents) {
        const err: Error & { statusCode?: number } = new Error(
          `payment ${payment_intent_id} was taken at a different price than ` +
          `this order totals now - contact support with that reference`
        );
        err.statusCode = 409;
        throw err;
      }
      intentAlreadySucceeded = intent.payment_status === "succeeded";
    } else {
      // An OPEN intent attached to an earlier sale is the drawer's own
      // abandonment arriving back: the intent is opened per customer and
      // REUSED, so the previous attempt's unpaid order is still holding it.
      // The intent has not settled, so nothing was paid by it - a still-
      // Pending predecessor is cancelled (credit refunded); one already moved
      // on (Cancelled, or advanced by hand) is merely detached.
      if (intent.sales_order_id) {
        await withTransaction(async (client) => {
          await reconcileService.cancelPendingSale(
            intent.sales_order_id as string, "superseded-by-admin-retry", client
          );
          await stripeRepo.attachOrder(payment_intent_id, null, null, client);
        });
      }
      // The authoritative amount, stamped NOW - outside the transaction,
      // because a Stripe call does not belong inside one - so what gets
      // confirmed is exactly what the server priced, whatever the drawer's
      // last update left on the intent.
      const updated = await stripeProvider.updateIntent(payment_intent_id, {
        amount: chargeCents,
      });
      await stripeRepo.updatePaymentIntent(updated);
    }
  }

  const orderId = await withTransaction(async (client) => {
    const orderId = await salesOrderWrites.insertSalesOrder(client, {
      user: user,
      // The label derives from a money fact, as on the customer path: nothing
      // left to charge - full credit, whatever the method was called - means
      // nothing to await, and a repaired already-paid intent means born paid.
      status: chargeCents > 0 && !intentAlreadySucceeded ? "Pending" : "Preparing",
      sales_order: sales_order,
      orderPrices,
    });

    if (sales_order.using_funds === true) {
      await usersService.removeFunds(
        user.id,
        orderPrices.pre_charges_amount,
        client
      );
      await transactionsService.addTransactionLog(
        user.id,
        "Debit",
        null,
        orderId,
        orderPrices.pre_charges_amount,
        client
      );
    }

    await insertLines(client, orderId, items, spot_prices);

    await taxService.updateStateSalesTax(
      orderPrices.sales_tax,
      address.state,
      client
    );

    if (orderPrices.post_charges_amount > 0) {
      await stripeRepo.attachOrder(payment_intent_id, null, orderId, client);
    }

    return orderId;
  });

  return await getSaleById(orderId);
}

export async function updateSalesStatus({
  order,
  order_status,
  user_name,
}: {
  order: SalesOrderRow;
  order_status: string;
  user_name: string;
}): Promise<SalesOrderRow | undefined> {
  // The status write returns the id it touched, not the order. The route
  // answers with it and always has - repo.exchange.js returned `rows[0]` of an
  // UPDATE ... RETURNING *, which the caller never read a field off.
  return (await salesOrderWrites.updateSalesStatus(
    order, order_status, user_name ?? null
  )) as unknown as SalesOrderRow;
}

// `transport` is a separate parameter, not a field on the input object, for the
// reason features/emails/service.ts gives: the controller hands req.body
// straight to this function, so a field would be reachable from the request.
// Nothing in production passes one; a test passes a recorder, which is what
// makes the guard below testable without mail leaving the building.
export async function sendOrderToSupplier(
  // `spots` speaks the converted names (`name` / `ask`) since D84 - the
  // renderer prints them on the refiner's copy.
  { order, spots, supplier_id }: { order: { id: string }; spots: PricingSpot[]; supplier_id: string },
  transport?: Transport
): Promise<SalesOrderRow | undefined> {
  const sales_order = await getSaleById(order.id);

  // AN ORDER THAT DOES NOT EXIST MUST NOT REACH A REFINER.
  //
  // getSaleById returns undefined for an id with no row, and everything below reads
  // fields off it - so the old code threw a TypeError and answered 500. That is
  // the harmless version. The reason this is a guard and not a tidy-up is what
  // sits further down: this function attaches a supplier, creates an outbound
  // shipment and emails a refiner their copy of the order. A 404 here is the
  // difference between refusing and starting that sequence against nothing.
  if (!sales_order) {
    const err: Error & { statusCode?: number } = new Error(`no sales order ${order.id}`);
    err.statusCode = 404;
    throw err;
  }

  const supplier = await refinerRepo.getRefinerFromId(supplier_id);

  // An order with no address cannot be sent to a refiner: the whole point of
  // the message is telling them where to ship the metal.
  //
  // This was found by typing renderEmail. SalesOrder declares
  // `address: OrderAddressSnapshot.nullable()` and production means it - sales order
  // 55 has address_id NULL - so the renderer threw a TypeError on
  // `addr.line_1`. It threw *after* the transaction below, which is where the
  // comment on that transaction says the acceptable failure lives: an order
  // marked sent whose email did not arrive. That is only acceptable when it is
  // visible. A refuse here makes it visible, and makes it a no-op: nothing is
  // attached, no shipment is created, order_sent stays false, and the admin
  // gets a message saying which order and why.
  if (!sales_order.address) {
    throw new Error(
      `Sales order ${sales_order.number} has no address, so it cannot be sent to a supplier`
    );
  }

  // A SENT ORDER MAY BE RE-SENT TO THE SAME REFINER, AND MAY NOT BE MOVED TO
  // ANOTHER ONE.
  //
  // Nothing used to check order_sent at all, so calling this twice overwrote
  // supplier_id with no audit trail and no updated_at (attachSupplierToOrder
  // and updateOrderSent both leave it alone), created a SECOND outbound
  // shipment, and emailed the new refiner their copy - leaving two refiners
  // each holding one order, one of them expecting to ship metal.
  //
  // A blanket refusal would be wrong: the comment on the transaction below
  // names resending as the recovery path for its own accepted worst case, an
  // order marked sent whose email did not arrive. So the same refiner is
  // allowed through and takes the email again WITHOUT a second shipment or a
  // second attach; a different one is refused, because moving an order to
  // another refiner after it has gone is not something to do silently and
  // there is no unsend to do it deliberately.
  const alreadySent = sales_order.order_sent === true;
  if (alreadySent && sales_order.supplier_id !== supplier_id) {
    const err: Error & { statusCode?: number } = new Error(
      `Sales order ${sales_order.number} has already been sent to a refiner. ` +
        `Sending it to a different one would leave two refiners holding it.`
    );
    err.statusCode = 409;
    throw err;
  }

  const supplierEmail = supplier?.organization?.email;
  if (!supplierEmail) {
    const err: Error & { statusCode?: number } = new Error(
      `Refiner ${supplier?.organization?.name ?? supplier_id} has no email address, ` +
        `so sales order ${sales_order.number} cannot be sent to them`
    );
    err.statusCode = 422;
    throw err;
  }

  // The record first, the email second.
  //
  // The send used to be the first statement inside this transaction, so if any
  // of the three writes below failed the transaction rolled back and the
  // refiner had already been sent the order and its invoice. For a sales order
  // that means they ship metal to the customer - against an order with no
  // supplier attached, no outbound shipment and no record of having been sent.
  //
  // Both orderings can fail; they are not equally bad. This way the worst case
  // is an order marked sent whose email did not arrive, which nobody acts on
  // and an admin can resend. The other way round, metal leaves the building
  // against a record that was rolled back.
  // Skipped entirely on a resend: the supplier is already attached, the outbound
  // shipment already exists, and order_sent is already true. Running it again
  // is what created the duplicate shipment.
  if (!alreadySent) {
    await withTransaction(async (client) => {
      await salesOrderWrites.attachSupplierToOrder(
        sales_order.id,
        supplier_id,
        client
      );

      await shipmentRepo.create(
        { sales_order_id: sales_order.id, type: "Outbound" },
        client
      );

      await salesOrderWrites.setSalesFlag(sales_order.id, "order_sent", client);
    });
  }

  // supplier.organization.email, NOT supplier.email.
  //
  // THE REFINER'S COPY HAS NEVER ARRIVED. A refiner has no top-level email in
  // either schema - both projections nest name/email/phone/enabled under
  // `organization` (exchange builds it with jsonb_build_object; the new schema
  // composes it) - so `supplier.email` was undefined, and sendEmail was handed
  // `to: undefined`. nodemailer refuses that, and it throws AFTER the
  // transaction has committed - which is exactly the accepted worst case this
  // function's own comment describes: an order marked sent whose email did not
  // arrive. Permanently, for every sales order ever sent to a refiner.
  //
  // Invisible to tsc because repo.js resolved its implementation through a
  // dynamic index, which erases every export to `any` - the same hazard
  // lint:row-vs-list exists for.
  //
  // A refiner with no email at all is refused BEFORE the transaction rather
  // than after it. Dillion Gage is exactly that in production: is_active false,
  // no email. Sending metal against an order nobody was told about is the
  // failure this whole ordering exists to prevent.
  await emailService.sendSalesOrderToSupplier(
    sales_order,
    spots,
    supplierEmail,
    transport
  );

  return await getSaleById(sales_order.id);
}

export async function updateTracking({
  order_id,
  shipment_id,
  tracking_number,
  carrier_id,
}: {
  order_id: string;
  shipment_id: string;
  tracking_number: string;
  carrier_id: string;
}): Promise<unknown> {
  // THIS AWAITED shipmentRepo.insertTrackingNumber, WHICH DOES NOT EXIST.
  //
  // The shipments repo exports getAll, getById, getByOrder, create, update and
  // remove, and never had an insertTrackingNumber - checked against master,
  // which is what auto-deploys, as well as here. `import * as` makes a missing
  // name `undefined` rather than an import error, so
  // POST /api/sales_orders/update_tracking answered 500 on every call: an admin
  // could not record a tracking number against a sales order at all.
  //
  // Read-then-update is the pattern this codebase already uses for the same
  // shape of change - see cancelLabel in features/shipping/operations/service.ts,
  // which spreads the shipment and overrides one field. Going through
  // shipmentRepo.update also means the write follows the SHIPMENTS_SOURCE switch
  // and its dual-write, which a bespoke UPDATE here would have bypassed.
  const shipment = await shipmentRepo.getById(shipment_id);
  if (!shipment) {
    const err: Error & { statusCode?: number } = new Error(`no shipment ${shipment_id}`);
    err.statusCode = 404;
    throw err;
  }

  await shipmentRepo.update({
    ...shipment,
    tracking_number,
    carrier_id,
  });
  return await salesOrderWrites.setSalesFlag(order_id, "tracking_updated");
}

export async function createSalesReview({ order }: { order: SalesOrderRow }): Promise<unknown> {
  return await salesOrderWrites.setSalesFlag(order.id, "review_created");
}
