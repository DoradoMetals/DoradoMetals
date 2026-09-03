// THE ORDER'S USE CASES, one function each, all of them small (D214 item 11).
//
// Every one reads the same way:
//
//   LOAD    the records, by id
//   ASSERT  one call into rules.ts, which throws a domain error
//   WRITE   inside withTransaction, a few lines
//   AFTER   the label, the email, the charge - outside it, because none of
//           those can be rolled back
//
// They live together because each is a screen or less. `place` is the one that
// outgrew a file and kept its own (place.ts).
//
// WHAT LEFT WITH THEM: add-funds.ts, cancel.ts, finalize-pricing.ts, patch.ts,
// edit-line.ts, send-to-refiner.ts and update-tracking.ts - seven files whose
// combined 855 lines were mostly the PATCH dispatcher that multiplexed four
// actions through one body, the `{scrap, bullion}` drawer document, and the
// `Record<string, unknown>` casts each of those needed.
import * as ordersRepo from "#db/orders/repo.ts";
import * as itemsRepo from "#db/orders/items/repo.ts";
import * as orderSpots from "#db/orders/spots/repo.ts";
import * as orderTransactions from "#db/orders/transactions/repo.ts";
import * as refinerSpots from "#db/refiners/spots/repo.ts";
import * as refinerOrders from "#db/refiners/orders/repo.ts";
import * as productsRepo from "#db/products/repo.ts";
import * as packagesRepo from "#db/shipping/packages/repo.ts";
import * as newShipments from "#db/shipping/shipments/repo.ts";

import * as ratesService from "#domain/rates/service.ts";
import * as spotsFeed from "#domain/spots/service.ts";
import * as refinerService from "#domain/refiners/service.ts";
import * as shipmentService from "#domain/shipping/shipments/service.ts";
import * as carrierServices from "#domain/shipping/services/service.ts";
import * as shippingOperations from "#domain/shipping/operations/service.ts";
import * as shippingOps from "#domain/shipping/operations/handler.ts";
import * as emailService from "#domain/media/emails/service.ts";
import * as documentInputs from "#domain/media/pdfs/order-inputs.ts";
import * as usersService from "#domain/users/service.ts";
import * as ledger from "#domain/transactions/service.ts";
import * as orderRead from "#domain/orders/read.ts";
import * as rules from "#domain/orders/rules.ts";
import { calculateTotalPrice, fineContent, unitPrice } from "#domain/pricing/service.ts";

import withTransaction from "#shared/db/withTransaction.ts";
import { Invalid, NotFound } from "#shared/errors.ts";
import type { Transport } from "#providers/emails/nodemailer.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { OrderItemRow } from "#db/orders/items/repo.ts";
import type {
  OrderCancel,
  OrderItemCreate,
  OrderItemPatch,
  OrderPatch,
  OrderView,
} from "@dorado/contracts";

// ===========================================================================
// THE ORDER ROW
// ===========================================================================

// PATCH /api/orders/:id - the order's own writable columns and nothing else.
// The four ACTIONS that used to ride in this body (add_funds, finalize_pricing,
// cancel, supplier) are their own endpoints now, so there is no dispatcher, no
// direction matrix and no per-field refusal message left here.
export async function patch(order_id: string, changes: OrderPatch): Promise<OrderView> {
  if (Object.keys(changes).length === 0) {
    throw new Invalid("the document names no field to write");
  }
  const written = await withTransaction((tx) => ordersRepo.update(order_id, changes, {}, tx));
  if (!written) throw new NotFound(`no order ${order_id}`);
  return await viewOf(order_id);
}

async function viewOf(order_id: string): Promise<OrderView> {
  const order = await orderRead.view(order_id);
  if (!order) throw new NotFound(`no order ${order_id}`);
  return order;
}

// ===========================================================================
// THE ORDER'S LINES
// ===========================================================================

// THE PREMIUM IS THE BUSINESS'S, NOT THE BROWSER'S: EVERY line's premium is
// re-resolved from the rates table, tiered by the order's TOTAL content of each
// metal - scrap from the band's scrap_pct, bullion from its bullion_pct (Jacob,
// 2026-09-03). rules.retierPlan decides; this applies.
//
// PURCHASE ONLY, and the direction is read here rather than passed: a sale's
// premium is the product's ASK, and tiering it from the bid-side rates table
// would pay the customer's price into what they are charged.
export async function retierPremiums(order_id: string, executor?: Executor): Promise<void> {
  if ((await ordersRepo.directionOf(order_id, executor)) !== "purchase") return;
  const rates = await ratesService.getAllRates();
  const lines = await itemsRepo.pricedLinesFor(order_id, executor);
  for (const { id, premium } of rules.retierPlan(rates, lines)) {
    const repriced = await itemsRepo.update(id, { premium }, {}, executor);
    if (!repriced) {
      throw new Error(
        `order ${order_id}: line ${id} vanished mid-write - its premium was not ` +
          `repriced and this transaction must not commit`
      );
    }
  }
}

// VERBATIM rows (rulings 9 + 12), both directions. No lines answers [].
export async function linesFor(order_id: string): Promise<OrderItemRow[]> {
  return await itemsRepo.getFor(order_id);
}

// A NEW LINE, from ids the client already holds. The body is a union of two
// members and two pure rules turn either into a row: a catalogue product, or a
// declared lot of scrap. No metal NAMES cross the wire - the old body sent one
// and the server resolved it against metals.metals.
export async function createLine(
  order_id: string, input: OrderItemCreate
): Promise<OrderItemRow> {
  rules.assertDirection(
    await ordersRepo.directionOf(order_id), "purchase", "adding a line"
  );

  const row = "bullion_id" in input
    ? rules.lineFromProduct(order_id, await requireProduct(input.bullion_id))
    : rules.lineFromScrap(order_id, input);

  return await withTransaction(async (tx) => {
    const created = await itemsRepo.create(row, tx);
    // The refiner counterpart (093), then the whole order re-tiered so an
    // admin-added line matches customer checkout - and so the new line is BORN
    // at its tier rather than at null. The line is re-read because the re-tier
    // writes it.
    await refinerService.mirrorLinesForOrder(order_id, tx);
    await retierPremiums(order_id, tx);
    return (await itemsRepo.getOne(created.id, tx)) ?? created;
  });
}

async function requireProduct(bullion_id: string) {
  const [product] = await productsRepo.getByIds([bullion_id]);
  if (!product) throw new NotFound(`no product ${bullion_id} to put on the order`);
  return product;
}

// ONE ROW, ONE PATCH. The body used to be `{scrap: {premium, scrap: {...}},
// bullion: {quantity, premium}, confirmed, reset}` - two nested documents for
// one table, read through casts, every field re-spelled with `?? null`.
//
// It is the line's own columns now: a key present is written, an explicit null
// clears, an absent key is left alone (shared/db/patch.ts). `content` is not
// one of them - it is DERIVED here from the weight, the unit and the purity,
// because two definitions of what content means is the defect that costs money.
export async function editLine(
  line_id: string, changes: OrderItemPatch
): Promise<OrderItemRow> {
  if (Object.keys(changes).length === 0) {
    throw new Invalid("the document names no field to write");
  }
  const line = await itemsRepo.getOne(line_id);
  if (!line) throw new NotFound(`no order item ${line_id}`);

  // The weights the line will hold once this patch is applied - a key the
  // document does not carry keeps the stored value.
  const weight = changes.post_melt !== undefined ? changes.post_melt : line.post_melt;
  const preMelt = changes.pre_melt !== undefined ? changes.pre_melt : line.pre_melt;
  const unit = changes.unit !== undefined ? changes.unit : line.unit;
  const purity = changes.purity !== undefined ? changes.purity : line.purity;

  return await withTransaction(async (tx) => {
    const written = await itemsRepo.update(
      line_id,
      Object.assign({ content: fineContent(weight ?? preMelt, unit, purity) }, changes),
      { order_id: line.order_id },
      tx
    );
    if (!written) throw new NotFound(`no order item ${line_id}`);
    // A weight change moves the order's total content, so every line re-tiers -
    // unless the document named a premium, which is the admin's own.
    if (rules.retiersAfterEdit(changes)) await retierPremiums(line.order_id, tx);
    return (await itemsRepo.getOne(line_id, tx))!;
  });
}

// The line, and the re-tier its removal forces. The scrap goes with the line
// because the scrap IS the line, and refiners.items cascades.
export async function removeLine(line_id: string): Promise<{ success: true }> {
  const line = await itemsRepo.getOne(line_id);
  if (!line) throw new NotFound(`no order item ${line_id}`);

  await withTransaction(async (tx) => {
    const removed = await itemsRepo.remove(line_id, line.order_id, tx);
    if (!removed) {
      throw new Error(
        `order ${line.order_id}: line ${line_id} was not removed - this ` +
          `transaction must not commit`
      );
    }
    // Removing a line changes the per-metal totals, so re-tier the survivors.
    await retierPremiums(line.order_id, tx);
  });

  return { success: true };
}

// ===========================================================================
// THE MONEY
// ===========================================================================

// POST /api/orders/:id/finalize_pricing - what the business will pay.
//
// EVERY NUMBER IS THE SERVER'S. It used to take the order, its spots and the
// live feed as arguments assembled by the PATCH dispatcher; all three are read
// here, from the order's own id.
export async function finalizePricing(order_id: string): Promise<OrderView> {
  const order = await viewOf(order_id);
  rules.assertDirection(order.order.direction, "purchase", "finalizing pricing");

  await withTransaction(async (tx) => {
    // A LOCKED ORDER KEEPS THE SPOTS IT WAS LOCKED AT; an unlocked one takes
    // today's, which is what locking is for.
    if (!order.order.spots_locked) {
      const live = new Map((await spotsFeed.getSpotPrices(tx)).map((s) => [s.id, s.bid]));
      for (const spot of await orderSpots.getRowsFor(order_id, tx)) {
        await orderSpots.update(order_id, spot.metal_id, { bid: live.get(spot.metal_id) ?? null }, tx);
      }
    }
    const frozen = await orderSpots.getRowsFor(order_id, tx);
    const bids = new Map(frozen.map((s) => [s.metal_id, s.bid]));

    // The refiner's copies, keyed the same way.
    for (const spot of frozen) {
      await refinerSpots.update(order_id, spot.metal_id, { bid: spot.bid }, tx);
    }

    for (const line of order.items) {
      await itemsRepo.update(line.id, { price: unitPrice(line, bids) }, { order_id }, tx);
    }

    // The total, and the PIN: pricing an order freezes the spots it priced at.
    await orderTransactions.update(
      order_id, { total: calculateTotalPrice(order, bids) }, {}, tx
    );
    await ordersRepo.update(order_id, { spots_locked: true }, {}, tx);
  });

  return await viewOf(order_id);
}

// POST /api/orders/:id/add_funds - credit the order's total to the customer.
//
// THE LEDGER MUST RECORD WHAT WAS ACTUALLY CREDITED. One figure, read once:
// logging a separately computed number is how nine production Credit entries
// came to disagree with the orders they explain.
export async function addFunds(order_id: string): Promise<OrderView> {
  const order = await viewOf(order_id);
  rules.assertDirection(order.order.direction, "purchase", "adding funds");

  const amount = order.totals?.total ?? null;
  if (amount === null) {
    throw new Invalid(
      `order ${order.order.number} has no total, so there is nothing to credit`
    );
  }

  await withTransaction(async (tx) => {
    await usersService.addFunds(order.order.user_id, amount, tx);
    await ledger.addTransactionLog(
      { user_id: order.order.user_id, type: "Credit", order_id, amount }, tx
    );
  });

  return await viewOf(order_id);
}

// ===========================================================================
// THE OUTSIDE WORLD
// ===========================================================================

// POST /api/orders/:id/cancel - the customer's metal goes back.
//
// A LABEL IS BILLABLE AND CANNOT BE ROLLED BACK, so it is bought BEFORE the
// transaction and voided if the database work fails. Voiding is idempotent.
//
// NO STATUS WRITE: statuses are labels, never side effects (Jacob). The
// 'Cancelled' label is a PATCH of its own.
//
// THE ADDRESS IS THE ORDER'S SNAPSHOT and the contact is the provider's
// configured one. This took the admin drawer's whole form as
// `Record<string, any>` and hand-mapped fifteen fields out of it.
export async function cancel(
  order_id: string,
  { carrier_service_id, package_id, declared_value, weight }: OrderCancel
): Promise<OrderView> {
  const order = await viewOf(order_id);
  rules.assertDirection(order.order.direction, "purchase", "cancelling");

  const box = await packagesRepo.getOne(package_id);
  if (!box) throw new Invalid("that package does not exist");
  const service = await carrierServices.labelServiceFor(carrier_service_id);
  const declaredValue = await carrierServices.clampInsuredValue(
    declared_value, service.serviceType
  );

  const labelData = await shippingOps.createLabel(
    service.carrier_id,
    undefined,
    rules.returnLabelRequest(order, {
      serviceType: service.serviceType,
      weight: { units: "LB", value: weight },
      dimensions: {
        length: Number(box.length), width: Number(box.width),
        height: Number(box.height), units: "IN",
      },
      declaredValue,
    })
  );
  const label = await shippingOperations.labelBufferOrVoid(labelData);

  try {
    await withTransaction(async (tx) => {
      await ordersRepo.update(order_id, { spots_locked: false }, {}, tx);

      // THE BID ONLY: the ask is what the same metal sells for, and clearing it
      // would lose a number this unpin never owned.
      for (const spot of await orderSpots.getRowsFor(order_id, tx)) {
        await orderSpots.update(order_id, spot.metal_id, { bid: null }, tx);
      }

      // ONE RETURN SHIPMENT, written with everything known: the service that
      // created it links it to the order, the record that follows is the row.
      const shipment = await shipmentService.create(
        { order_id, type: "Return" }, tx
      );
      if (!shipment) throw new Error("the return shipment was not created");

      const recorded = await newShipments.update(
        shipment.id,
        {
          tracking_number: labelData.tracking_number,
          shipping_status: "Label Created",
          label,
          label_type: "Generated",
          package_id,
          carrier_service_id,
          insured: declaredValue > 0,
          declared_value: declaredValue > 0 ? declaredValue : null,
          direction: "Return",
        },
        tx
      );
      if (!recorded) {
        throw new Error(
          `order ${order_id}: the return label was not recorded and this ` +
            `transaction must not commit`
        );
      }
    });
  } catch (err) {
    await shippingOperations.voidLabel(labelData.tracking_number);
    throw err;
  }

  return await viewOf(order_id);
}

// POST /api/orders/:id/send_to_refiner - they ship the metal to the customer.
//
// THE RECORD FIRST, THE EMAIL SECOND. The other order lets metal leave the
// building against a transaction that then rolls back; this one's worst case is
// an order marked sent whose email did not arrive, which an admin can resend.
//
// THE SPOTS THE MESSAGE QUOTES ARE THE ORDER'S OWN, read here. They used to
// arrive in the request body - the $26.81-an-ounce hazard.
export async function sendToRefiner(
  order_id: string, refiner_id: string, transport?: Transport
): Promise<OrderView> {
  const order = await viewOf(order_id);
  rules.assertDirection(order.order.direction, "sale", "sending to a refiner");

  const refiner = await refinerService.getRefinerFromId(refiner_id);
  const engagement = await refinerOrders.findByOrder(order_id);
  rules.assertSendable(order, {
    refiner_id,
    attachedRefinerId: engagement?.refiner_id ?? null,
    refinerEmail: refiner?.organization?.email,
  });

  // Skipped on a resend: running it again is what created a second shipment.
  if (order.order.order_sent !== true) {
    await withTransaction(async (tx) => {
      // The engagement owns which refinery has the metal (refiners.orders, 093).
      const engagementId = await refinerService.engagementIdFor(order_id, tx);
      const attached = await refinerOrders.update(engagementId, { refiner_id }, tx);
      if (!attached) {
        throw new Error(
          `sales order ${order_id}: the refiner was not attached - this ` +
            `transaction must not commit`
        );
      }
      await shipmentService.create({ order_id, type: "Outbound" }, tx);
      await ordersRepo.update(order_id, { order_sent: true }, {}, tx);
    });
  }

  await emailService.sendSalesOrderToSupplier(
    await documentInputs.salesOrderInvoiceInputs(order_id),
    refiner!.organization!.email!,
    transport
  );

  return await viewOf(order_id);
}

// A tracking number an admin was given by hand, recorded against the order's
// parcel. `patch`, not `update`: the shipment row carries no service NAME to
// resolve against, so this preserves carrier_service_id / package_id verbatim.
export async function updateTracking(
  order_id: string, tracking_number: string
): Promise<{ success: true }> {
  const shipment = await shipmentService.getByOrder(order_id);
  if (!shipment) throw new NotFound(`order ${order_id} has no shipment to track`);

  await shipmentService.patch(shipment.id, { tracking_number });
  // The flag write needs a transaction even alone: the audit actor reaches the
  // connection through withTransaction's set_config and nowhere else (116).
  await withTransaction((tx) => ordersRepo.update(order_id, { tracking_updated: true }, {}, tx));
  return { success: true };
}
