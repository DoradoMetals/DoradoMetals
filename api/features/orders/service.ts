// THE ORDER LIFECYCLE, both directions.
//
// Was features/purchase-orders/service.ts and features/sales-orders/service.ts.
// Direction is a COLUMN, not a feature, so the two live here together - and
// every function that exists in both directions SAYS WHICH ONE IT IS. There is
// no bare `getById` any more, deliberately: a merged file where the unprefixed
// name silently means "purchase" is a trap.
//
// THE PIVOT (ruling 8): reads come from read.service.ts - the new schema,
// decomposed, one implementation - and the purchase writes go through
// repo.dual.js unconditionally, exchange and the new schema in one
// transaction. A sales order is dual-written directly by write.service.ts
// instead of through a mirror. There is no *_SOURCE switch on either: there is
// no exchange-read mode left to select.
//
// READS AND WRITES PIVOTED TOGETHER, and that ordering is the whole point.
// Pointing the reads at the new schema while the writes still went to exchange
// alone was tried on purchase orders and broke immediately: a read cannot see a
// write that just happened, so an admin changed a status and the drawer showed
// the previous one. Reads move when the dual write lands beside them, in one
// change. `verify:orders-decomposition` and
// `verify:sales-order-decomposition` are what made that safe to make rather
// than hope about.

import withTransaction from "#shared/db/withTransaction.js";
// THE PIVOT (ruling 8): reads come from read.service.ts - the new schema,
// decomposed, one implementation - and writes go through repo.dual.js
// unconditionally, exchange and the new schema in one transaction. The
// repo.js switch is gone: there is no exchange-read mode left to select.
import * as purchaseOrderRepo from "#features/orders/repo.dual.js";
import * as readService from "#features/orders/read.service.ts";
import * as mirror from "#features/orders/repo.mirror.ts";
import * as scrapRepo from "#features/scrap/repo.ts";
// THE NEW-SCHEMA HALF OF THE THREE PAYOUT WRITES (099). exchange.payouts is one
// flat row holding an account, an order link and a fee; those are three columns
// in three places now, and they belong to the features that own those tables -
// the same reasoning editShippingCharge below is written against.
import * as payoutAccounts from "#features/payments/details/repo.ts";
import * as orderTransactions from "#features/orders/transactions/repo.ts";
import * as emailService from "#features/media/emails/service.ts";
import * as transactionsService from "#features/transactions/service.ts";
import * as usersFunds from "#features/users/service.ts";
import * as ratesRepo from "#features/rates/service.ts";
import { calculateTotalPrice } from "#features/pricing/service.ts";
import { getRatePct, sumContentByMetal } from "#features/rates/utils/resolveRate.ts";

// The SERVICE, not a repo: a shipment is composed from six tables now, and
// the order link it carries is reconstructed rather than stored.
import * as shipmentRepo from "#features/shipping/shipments/service.ts";
// The SERVICE, not a repo: a pickup hangs off a SHIPMENT now, and the order,
// the user and the carrier it reports are reconstructed through one.
import * as pickupRepo from "#features/shipping/pickups/service.ts";
import * as shippingOps from "#features/shipping/operations/handler.ts";
import * as carrierServices from "#features/shipping/services/service.ts";

import type {
  PurchaseOrderRow,
  PurchaseOrderMetalRow as OrderMetalRow,
  OrderScrapItemRow,
} from "#features/orders/repo.mirror.ts";
import type { ComposedItem as PurchaseOrderItem } from "#features/orders/compose.ts";
import type { PricingSpot } from "#features/pricing/service.ts";

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
import { auth } from "#features/auth/client.ts";
import { fromNodeHeaders } from "better-auth/node";
// READS AND WRITES PIVOTED TOGETHER, and that ordering is the whole point.
//
// Pointing the reads at the new schema while the writes still went to exchange
// alone was tried on purchase orders and broke immediately: a read cannot see a
// write that just happened, so an admin changed a status and the drawer showed
// the previous one. Reads move when the dual write lands beside them, in one
// change, which is what every other restructured feature did.
//
// `verify:sales-order-decomposition` is what made it safe to make rather than
// hope about: it compares the new read against the composed query AND against
// repo.exchange.js - the implementation that was serving traffic - across every
// order and every nested object.
import * as salesOrderWrites from "#features/orders/write.service.ts";
import * as orderSpots from "#features/orders/spots/repo.ts";
import * as metalsRepo from "#features/metals/repo.ts";
import { calculateItemAsk } from "#features/pricing/service.ts";
import * as stripeRepo from "#features/payments/repo.js";
import * as usersService from "#features/users/service.ts";
// The SERVICE, not a repo: a shipment is composed from six tables now, and
// the order link it carries is reconstructed rather than stored.
import * as refinerRepo from "#features/refiners/service.ts";
import * as addressService from "#features/places/addresses/service.ts";
import * as taxService from "#features/sales-tax/service.ts";
import * as spotsService from "#features/spots/service.ts";
import * as productService from "#features/products/service.ts";
import { calculateSalesOrderTotal } from "#features/pricing/service.ts";

import type { SalesOrderRow, SalesOrderMetalRow } from "#features/orders/repo.mirror.ts";
import type { PoolClient } from "pg";
import { reportError } from "#shared/observability/report.ts";
import type { PaymentSession } from "#features/payments/service.ts";
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
async function undoLabel(trackingNumber: string | undefined | null): Promise<void> {
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

// THE READS PIVOTED WITH THE WRITES, TOGETHER - the sequencing lesson this
// comment used to record the failure of. An earlier attempt pointed the reads
// at read.service.ts alone, while PURCHASE_ORDERS_SOURCE=exchange sent every
// write to exchange only, and two replay tests caught reads that could not
// see a write that just happened. The pivot now is whole: reads from the new
// schema (read.service.ts), writes to BOTH schemas (repo.dual.js),
// unconditionally - the same shape every other restructured feature landed
// in, with the covenant (data verified green before the legacy reads died)
// cleared by the wave-1 parity ledger.
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
  return mirror.findPurchaseMetalsByOrderId(orderId);
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
      await purchaseOrderRepo.toggleSpots(false, order.id, client);
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

  // THE SAME PAYOUT, IN THE NEW SCHEMA. Three writes because exchange.payouts
  // is three things in one row (073): the ACCOUNT becomes payments.details, the
  // ORDER LINK becomes orders.transactions.payout_details_id (099), and the FEE
  // becomes orders.transactions.payout_fee. Until this, insertPayout was a raw
  // pass-through with no mirror at all - not because it had been checked and
  // exempted, but because its successor's order link did not resolve. D168.
  //
  // ROUTING AND ACCOUNT NUMBERS ARE NOT PASSED. Only the last four, derived
  // here rather than carried. They stay in exchange.payouts and nowhere else
  // while encryption at rest is outstanding - see payments/details/sql/create.sql
  // and CLAUDE.md's standing constraint. This is why the pivot cannot finish for
  // this table without a decision that is Jacob's.
  //
  // The order's transactions row is written by the mirror inside insertOrder's
  // sync, so it exists by now; setPayoutAccount returning undefined would mean
  // it does not, which is a bug rather than a missing order.
  await recordPayoutInNewSchema(client, order_id, {
    user_id,
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

  if (!shipment) throw new Error("the inbound shipment was not created");
  await shipmentRepo.update(
    {
      ...shipment,
      id: shipment.id,
      tracking_number: label.tracking_number ?? null,
      carrier_id: FEDEX_CARRIER_ID,
      shipping_status: "Label Created",
      // `label.buffer` is the carrier provider's own loosely-typed payload.
      // Narrowed at the boundary rather than widening the shipment's type to
      // accept anything - the column is text and the value is a base64 buffer.
      shipping_label: (label.buffer as Buffer | string | null) ?? null,
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
  // WHAT THE LABEL IS INSURED FOR IS THE SERVER'S ANSWER, NOT THE BODY'S (D132).
  //
  // `insurance.declaredValue.amount` arrives in req.body. The browser used to
  // cap it at a literal 50000; migration 097 made the cap a column, and
  // /quotes/purchase_order already returns a capped figure - but a quote is not
  // a contract and this is the request that BUYS the cover. A body claiming a
  // million dollars of gold would otherwise be declared to FedEx verbatim, on
  // the label AND on shipments.declared_value, which is what a lost-parcel
  // claim is settled against.
  //
  // Clamped ONCE, here, before anything reads it: `purchase_order` is the same
  // object createLabel and recordPurchaseOrder are both handed below, so the
  // label, the shipment row and the order agree by construction rather than by
  // three call sites remembering. Narrowed to the service the customer chose -
  // `service.serviceType` is CarrierServiceOption.code round-tripped back.
  if (purchase_order.insurance?.declaredValue) {
    purchase_order.insurance.declaredValue.amount = await carrierServices.clampInsuredValue(
      purchase_order.insurance.declaredValue.amount,
      purchase_order.service?.serviceType
    );
  }

  const shipper = {
    contact: {
      // Snapshot shape (D84): recipient_name is the person on the label.
      // `purchase_order.address.id` stays the BOOK id and is what
      // recordPurchaseOrder stores.
      personName: purchase_order.address.recipient_name,
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
          personName: purchase_order.address.recipient_name,
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

  const created = ((await readService.findPurchaseById(order_id)) ?? undefined) as unknown as
    PurchaseOrderRow;

  // THE CONFIRMATION EMAIL, SENT HERE, AFTER THE COMMIT (D91). It was an
  // await in the browser's create mutation until wave 3 - see
  // features/media/emails/service.ts for the three reasons that was wrong.
  // Placed after withTransaction has RETURNED, never inside it: an email
  // cannot be rolled back, which is the rule
  // shared/db/transaction-side-effects.test.js fails the build over. It does
  // not throw; the order is placed either way and a failed send is recorded.
  await emailService.sendOrderPlacedConfirmation(order_id);

  return created;
}

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
    await purchaseOrderRepo.recordOrderPricing(order.id, total, client);

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
  spots: PricingSpot[];
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

  const scrapItems = await mirror.findOrderScrapItems(orderId, executor);
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

// The new-schema half of a payout, written beside the exchange row rather than
// derived from it. `sync` cannot do this job: mirrorPurchaseOrder rebuilds
// orders.transactions from exchange.purchase_orders, and a payout is not on
// that table - which is why payout_fee and payout_details_id are the two
// columns its ON CONFLICT deliberately does not touch, and why they are safe to
// write natively here.
//
// Best-effort on the ACCOUNT, exact on the FEE. `create` returns null when the
// method does not resolve against payments.methods (its SELECT drives the
// INSERT), and an unrecognised method must not take down an order that exchange
// has already recorded - so the link is skipped and the fee still lands.
async function recordPayoutInNewSchema(
  executor: PoolClient,
  order_id: string,
  payout: Record<string, any>
): Promise<void> {
  const account = String(payout.account_number ?? "");
  const details_id = await payoutAccounts.create(
    {
      user_id: payout.user_id,
      method: payout.method,
      account_holder: payout.account_holder_name ?? null,
      bank_name: payout.bank_name ?? null,
      account_type: payout.account_type ?? null,
      last_four: account.length >= 4 ? account.slice(-4) : null,
      email_to: payout.payout_email ?? null,
    },
    executor
  );
  if (details_id) {
    const linked = await orderTransactions.setPayoutAccount(order_id, details_id, null, executor);
    if (!linked) {
      reportError({
        at: "orders.recordPayoutInNewSchema.setPayoutAccount",
        message:
          `no orders.transactions row for order ${order_id} - the payout ACCOUNT ` +
          `link was not written, so this order has no record of where it is paid`,
        extra: { order_id, details_id },
      });
    }
  }
  // Same hole as the link above, on the fee rather than the account. D202.
  const feeWritten = await orderTransactions.setAmount(
    order_id, "payout_fee", payout.cost ?? 0, null, executor
  );
  if (!feeWritten) {
    reportError({
      at: "orders.recordPayoutInNewSchema.setAmount",
      message:
        `no orders.transactions row for order ${order_id} - the payout FEE was ` +
        `not recorded`,
      extra: { order_id, field: "payout_fee" },
    });
  }
}

// WAIVING THE PAYOUT FEE (Jacob, 2026-08-29). The flag, and only the flag: the
// stored fee stays exactly where it is, on exchange.payouts.cost and
// orders.transactions.payout_fee, so un-waiving does not have to reconstruct a
// number nobody kept. What changes is what the order PRICES at -
// pricing/bid.ts's effectivePayoutFee returns 0 while this is true, and the
// order quote and the profit breakdown read the same helper.
//
// ONE WRITE, BOTH SCHEMAS, unlike editPayoutCharge below - see
// legacy/purchase-orders/repo.exchange.js's setWaivePayoutFee for why the
// mirror can carry this one and could not carry the fee.
//
// An empty result means no exchange.purchase_orders row matched, which for a
// caller holding a payout means the payout hangs off a SALES order. The caller
// decides what that is; this says which it was.
export async function setWaivePayoutFee({
  order_id,
  waived,
}: {
  order_id: string;
  waived: boolean;
}): Promise<{ written: boolean }> {
  const result = (await purchaseOrderRepo.setWaivePayoutFee(order_id, waived)) as
    | { rowCount?: number | null }
    | undefined;
  return { written: (result?.rowCount ?? 0) > 0 };
}

export async function editPayoutCharge({
  order_id,
  payout_charge,
}: {
  order_id: string;
  payout_charge: number;
}): Promise<unknown> {
  // BOTH SCHEMAS, IN ONE TRANSACTION. 073 moved this fee to
  // orders.transactions.payout_fee and nothing started writing it: the exchange
  // statement was a pass-through in repo.dual.js, listed under "features that
  // have not moved" beside insertPayout - which was true of the account and
  // false of the fee. So the two agreed only until the first admin edit, and
  // then diverged silently with the order reading the stale copy.
  return await withTransaction(async (client) => {
    const r = await purchaseOrderRepo.editPayoutCharge(order_id, payout_charge, client);
    // The exchange half above succeeded; if the native half matches nothing the
    // two schemas diverge silently, which is the divergence this comment block
    // already describes happening once. D202.
    const written = await orderTransactions.setAmount(
      order_id, "payout_fee", payout_charge, null, client
    );
    if (!written) {
      reportError({
        at: "orders.editPayoutCharge",
        message:
          `no orders.transactions row for order ${order_id} - exchange.payouts.cost ` +
          `was updated and orders.transactions.payout_fee was not, so the two now disagree`,
        extra: { order_id, field: "payout_fee" },
      });
    }
    return r;
  });
}

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

export async function changePayoutMethod({
  order_id,
  method,
}: {
  order_id: string;
  method: string;
}): Promise<unknown> {
  // The method is a column on exchange.payouts and a FOREIGN KEY on
  // payments.details, so the new-schema half resolves it against
  // payments.methods rather than storing the string. It walks
  // orders.transactions.payout_details_id, which is the link 099 added; before
  // that it walked payments.intents and matched nothing.
  return await withTransaction(async (client) => {
    const r = await purchaseOrderRepo.changePayoutMethod(order_id, method, client);
    await payoutAccounts.setMethodForOrder(order_id, method, client);
    return r;
  });
}

export async function purgeCancelled(): Promise<unknown> {
  return await purchaseOrderRepo.purgeCancelled();
}

export async function getRefinerMetalsForOrder(orderId: string): Promise<OrderMetalRow[]> {
  return mirror.findRefinerMetalsByOrderId(orderId);
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

// `refiner_premium` IS NULLABLE, and the type said otherwise until A3. The
// refiners item PATCH declares `premium: number | null` on both sides of the
// wire and the admin drawer really sends the null - clearing the input is how a
// premium that was entered by mistake comes back off - while the statement
// underneath is a plain `SET refiner_premium = $1` that has always written it.
// The caller was reaching this through `as number`, which is a cast asserting
// something the data disproves rather than a conversion.
export async function updateRefinerPremium({
  item_id,
  refiner_premium,
}: {
  item_id: string;
  refiner_premium: number | null;
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
      const metal_id = (item as { metal_id?: string | null }).metal_id ?? null;
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
  const orderId = await withTransaction(async (client) => {
    const orderPrices = calculateSalesOrderTotal(
      items,
      sales_order.using_funds,
      spot_prices,
      session.user,
      sales_order.service.value,
      sales_order.payment_method
    );

    const orderId = await salesOrderWrites.insertSalesOrder(client, {
      user: session.user,
      status: sales_order.payment_method === "CREDIT" ? "Preparing" : "Pending",
      sales_order: sales_order,
      orderPrices,
    });

    if (sales_order.using_funds === true) {
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

    if (orderPrices.post_charges_amount > 0) {
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
  const orderId = await withTransaction(async (client) => {
    const orderPrices = calculateSalesOrderTotal(
      items,
      sales_order.using_funds,
      spot_prices,
      user,
      sales_order.service.value,
      sales_order.payment_method
    );

    const orderId = await salesOrderWrites.insertSalesOrder(client, {
      user: user,
      status: sales_order.payment_method === "CREDIT" ? "Preparing" : "Pending",
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
