import * as ordersRepo from "#db/orders/repo.ts";
import * as itemsRepo from "#db/orders/items/repo.ts";
import * as orderSpots from "#db/orders/spots/repo.ts";
import * as orderTransactions from "#db/orders/transactions/repo.ts";
import * as refinerSpots from "#db/refiners/spots/repo.ts";
import * as refinerOrders from "#db/refiners/orders/repo.ts";
import * as packagesRepo from "#db/shipping/packages/repo.ts";

import * as ratesService from "#domain/rates/service.ts";
import * as spotsFeed from "#domain/spots/service.ts";
import * as refinerService from "#domain/refiners/service.ts";
import * as shipmentService from "#domain/shipping/shipments/service.ts";
import * as carrierServices from "#domain/shipping/services/service.ts";
import * as shippingLabels from "#domain/shipping/labels.ts";
import * as emailService from "#domain/media/emails/service.ts";
import * as documentInputs from "#domain/media/pdfs/order-inputs.ts";
import * as usersService from "#domain/users/service.ts";
import * as ledger from "#domain/transactions/service.ts";
import * as orderRead from "#domain/orders/read.ts";
import * as rules from "#domain/orders/rules.ts";
import * as shippingRules from "#domain/shipping/rules.ts";
import { calculateTotalPrice, fineContent, unitPrice } from "#domain/pricing/service.ts";

import withTransaction from "#shared/db/withTransaction.ts";
import type { Transport } from "#providers/emails/nodemailer.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { OrderCancelBody, OrderItemPatch, OrderPatch, OrderView, OrderItem } from "@dorado/contracts";

export async function patch(order_id: string, changes: OrderPatch): Promise<OrderView> {
  rules.assertNamesAField(changes);
  const written = await withTransaction((tx) => ordersRepo.update(order_id, changes, {}, tx));
  rules.assertOrder(written || null, order_id);
  return await viewOf(order_id);
}

async function viewOf(order_id: string): Promise<OrderView> {
  const order = await orderRead.view(order_id);
  rules.assertOrder(order, order_id);
  return order;
}

export async function retierPremiums(order_id: string, executor?: Executor): Promise<void> {
  if ((await ordersRepo.directionOf(order_id, executor)) !== "purchase") return;
  const rates = await ratesService.listRates();
  const lines = await itemsRepo.pricedLinesFor(order_id, executor);
  for (const { id, premium } of rules.retierPlan(rates, lines)) {
    rules.assertRepriced(await itemsRepo.update(id, { premium }, {}, executor), order_id, id);
  }
}

export async function linesFor(order_id: string): Promise<OrderItem[]> {
  return await itemsRepo.getFor(order_id);
}

export async function createLine(
  order_id: string, input: OrderItemPatch
): Promise<OrderItem> {
  rules.assertDirection(
    await ordersRepo.directionOf(order_id), "purchase", "adding a line"
  );

  return await withTransaction(async (tx) => {
    const created = input.bullion_id
      ? await createFromCatalogue(order_id, input.bullion_id, tx)
      : await itemsRepo.create(order_id, rules.declaredLot(input), tx);
    await refinerService.mirrorLinesForOrder(order_id, tx);
    await retierPremiums(order_id, tx);
    return (await itemsRepo.getOne(created.id, tx)) ?? created;
  });
}

async function createFromCatalogue(order_id: string, bullion_id: string, tx: Executor) {
  const created = await itemsRepo.createFromProduct(order_id, bullion_id, tx);
  rules.assertCatalogueProduct(created, bullion_id);
  return created;
}

export async function editLine(
  line_id: string, changes: OrderItemPatch
): Promise<OrderItem> {
  rules.assertNamesAField(changes);
  const line = await itemsRepo.getOne(line_id);
  rules.assertLine(line, line_id);

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
    rules.assertLine(written, line_id);
    if (!rules.retiersAfterEdit(changes)) return written;
    await retierPremiums(line.order_id, tx);
    return (await itemsRepo.getOne(line_id, tx)) ?? written;
  });
}

export async function removeLine(line_id: string): Promise<{ success: true }> {
  const line = await itemsRepo.getOne(line_id);
  rules.assertLine(line, line_id);

  await withTransaction(async (tx) => {
    const removed = await itemsRepo.remove(line_id, line.order_id, tx);
    rules.assertRemoved(removed, line.order_id, line_id);
    await retierPremiums(line.order_id, tx);
  });

  return { success: true };
}

export async function finalizePricing(order_id: string): Promise<OrderView> {
  const order = await viewOf(order_id);
  rules.assertDirection(order.order.direction, "purchase", "finalizing pricing");

  await withTransaction(async (tx) => {
    if (!order.order.spots_locked) {
      const live = new Map((await spotsFeed.getSpotPrices(tx)).map((s) => [s.id, s.bid]));
      for (const spot of await orderSpots.getRowsFor(order_id, tx)) {
        await orderSpots.update(order_id, spot.metal_id, { bid: live.get(spot.metal_id) ?? null }, tx);
      }
    }
    const frozen = await orderSpots.getRowsFor(order_id, tx);
    const bids = new Map(frozen.map((s) => [s.metal_id, s.bid]));

    for (const spot of frozen) {
      await refinerSpots.update(order_id, spot.metal_id, { bid: spot.bid }, tx);
    }

    for (const line of order.items) {
      await itemsRepo.update(line.id, { price: unitPrice(line, bids) }, { order_id }, tx);
    }

    await orderTransactions.update(
      order_id, { total: calculateTotalPrice(order, bids) }, {}, tx
    );
    await ordersRepo.update(order_id, { spots_locked: true }, {}, tx);
  });

  return await viewOf(order_id);
}

export async function addFunds(order_id: string): Promise<OrderView> {
  const order = await viewOf(order_id);
  rules.assertDirection(order.order.direction, "purchase", "adding funds");

  const amount = order.totals?.total ?? null;
  rules.assertCreditable(amount, order.order.number);

  await withTransaction(async (tx) => {
    await usersService.addFunds(order.order.user_id, amount, tx);
    await ledger.addTransactionLog(
      { user_id: order.order.user_id, type: "Credit", order_id, amount }, tx
    );
  });

  return await viewOf(order_id);
}

export async function cancel(
  order_id: string,
  { carrier_service_id, package_id }: OrderCancelBody,
  buy: (shipment_id: string) => Promise<void> = shippingLabels.buyReturnLabel
): Promise<OrderView> {
  const order = await viewOf(order_id);
  rules.assertDirection(order.order.direction, "purchase", "cancelling");
  rules.assertReturnable(order);

  const box = await packagesRepo.getOne(package_id);
  shippingRules.assertParcelPackage(box);
  const service = await carrierServices.labelServiceFor(carrier_service_id);
  const declaredValue = await carrierServices.clampInsuredValue(
    shippingRules.declaredValue(order.totals?.total ?? 0), service.code
  );
  const insured = declaredValue > 0;

  const existing = order.shipments.find((s) => s.direction === "Return" && !s.tracking_number);

  const shipment_id = await withTransaction(async (tx) => {
    await ordersRepo.update(order_id, { spots_locked: false }, {}, tx);

    for (const spot of await orderSpots.getRowsFor(order_id, tx)) {
      await orderSpots.update(order_id, spot.metal_id, { bid: null }, tx);
    }

    let id = existing?.id;
    if (!id) {
      const shipment = await shipmentService.create({ order_id, direction: "Return" }, tx);
      shippingRules.assertReturnShipment(shipment);
      id = shipment.id;
    }
    await shipmentService.update(
      id,
      {
        package_id, carrier_service_id, insured,
        declared_value: insured ? declaredValue : null,
      },
      tx
    );
    return id;
  });

  await buy(shipment_id);

  return await viewOf(order_id);
}

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

  if (order.order.order_sent !== true) {
    await withTransaction(async (tx) => {
      const engagementId = await refinerService.engagementIdFor(order_id, tx);
      rules.assertRefinerAttached(
        await refinerOrders.update(engagementId, { refiner_id }, tx), order_id
      );
      await shipmentService.create({ order_id, direction: "Outbound" }, tx);
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

export async function updateTracking(
  order_id: string, tracking_number: string
): Promise<{ success: true }> {
  const shipment = await shipmentService.getByOrder(order_id);
  rules.assertShipmentToTrack(shipment, order_id);

  await withTransaction(async (tx) => {
    await shipmentService.update(shipment.id, { tracking_number }, tx);
    await ordersRepo.update(order_id, { tracking_updated: true }, {}, tx);
  });
  return { success: true };
}
