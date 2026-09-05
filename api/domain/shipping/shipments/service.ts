import * as shipments from "#db/shipping/shipments/repo.ts";
import * as fulfillmentLinks from "#db/fulfillments/shipments/repo.ts";
import * as fulfillmentsRepo from "#db/fulfillments/repo.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
import * as fulfillmentShipments from "#domain/fulfillments/shipments/service.ts";
import * as orders from "#db/orders/repo.ts";
import * as rules from "#domain/shipping/rules.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { Direction, OrderViewShipment, ShipmentDirection, ShipmentWrite } from "@dorado/contracts";

export async function getAll(executor?: Executor): Promise<OrderViewShipment[]> {
  return await shipments.getAll(executor);
}

export async function getById(
  id: string, executor?: Executor
): Promise<OrderViewShipment | null> {
  return (await shipments.getOne(id, executor)) ?? null;
}

export async function getByOrder(
  order_id: string, executor?: Executor
): Promise<OrderViewShipment | null> {
  const fulfillment = await fulfillmentsRepo.getByOrder(order_id, executor);
  if (!fulfillment) return null;

  const [link] = await fulfillmentLinks.getFor(fulfillment.id, executor);
  if (!link) return null;

  return await getById(link.shipment_id, executor);
}

export async function getByOrders(
  order_ids: string[], executor?: Executor
): Promise<Map<string, OrderViewShipment>> {
  const out = new Map<string, OrderViewShipment>();
  const ids = [...new Set(order_ids)];
  if (ids.length === 0) return out;

  const fulfillments = await fulfillmentsRepo.getByOrders(ids, executor);
  if (fulfillments.length === 0) return out;

  const links = await fulfillmentLinks.getMany(fulfillments.map((f) => f.id), executor);
  const firstLinkOf = new Map<string, string>();
  for (const link of links) {
    if (!firstLinkOf.has(link.fulfillment_id)) {
      firstLinkOf.set(link.fulfillment_id, link.shipment_id);
    }
  }

  const shipmentOf = new Map<string, string>();
  for (const f of fulfillments) {
    const shipment_id = firstLinkOf.get(f.id);
    if (shipment_id && f.order_id !== null) shipmentOf.set(f.order_id, shipment_id);
  }
  const wanted = [...new Set(shipmentOf.values())];
  if (wanted.length === 0) return out;

  const rows = await shipments.getMany(wanted, executor);
  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const [order_id, shipment_id] of shipmentOf) {
    const row = byId.get(shipment_id);
    if (row) out.set(order_id, row);
  }
  return out;
}

export async function getOrderLink(
  shipment_id: string, executor?: Executor
): Promise<{ order_id: string; direction: Direction } | null> {
  const [link] = await fulfillmentLinks.getByShipment([shipment_id], executor);
  if (!link) return null;
  const fulfillment = await fulfillmentsRepo.getOne(link.fulfillment_id, executor);
  if (!fulfillment?.order_id) return null;
  const direction = await orders.directionOf(fulfillment.order_id, executor);
  if (!direction) return null;
  return { order_id: fulfillment.order_id, direction };
}

export async function create(
  { order_id, direction }: { order_id?: string | null; direction: ShipmentDirection },
  tx: Executor
): Promise<OrderViewShipment | null> {
  const id = await shipments.create({ direction }, tx);

  if (order_id) {
    const orderDirection = await orders.directionOf(order_id, tx);
    rules.assertOrderForShipment(orderDirection, order_id);
    const fulfillment = await fulfillmentService.chooseDefault(
      { order_id, direction: orderDirection, category: "SHIPMENT" }, tx
    );
    await fulfillmentShipments.link(
      { fulfillment_id: fulfillment.fulfillment.id, shipment_id: id }, tx
    );
  }

  return await getById(id, tx);
}

export async function update(
  id: string, patch: ShipmentWrite, tx: Executor
): Promise<OrderViewShipment | null> {
  const written = await shipments.update(id, patch, tx);
  if (!written) return null;

  if (patch.shipping_status) {
    const [link] = await fulfillmentLinks.getByShipment([id], tx);
    if (link) {
      await fulfillmentService.setStatus(
        {
          id: link.fulfillment_id,
          status: patch.shipping_status === "Delivered" ? "COMPLETED" : "PENDING",
        },
        tx
      );
    }
  }

  return await getById(id, tx);
}

export async function setChargeForOrder(
  orderId: string, cost: number | null, tx: Executor
): Promise<string[]> {
  return await shipments.setChargeForOrder(orderId, cost, tx);
}

export async function remove(id: string, tx: Executor): Promise<boolean> {
  await fulfillmentLinks.removeByShipment(id, tx);
  await shipments.remove(id, tx);
  return true;
}
