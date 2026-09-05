import * as shipments from "#db/shipping/shipments/repo.ts";
import * as fulfillmentLinks from "#db/fulfillments/shipments/repo.ts";
import * as fulfillmentsRepo from "#db/fulfillments/repo.ts";
import * as fulfillmentService from "#logistics/fulfillments/service.ts";
import * as fulfillmentShipments from "#logistics/fulfillments/shipments/service.ts";
import * as orders from "#db/orders/repo.ts";
import * as rules from "#logistics/shipping/rules.ts";
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
  order_id: string | null, direction: ShipmentDirection, tx: Executor
): Promise<OrderViewShipment | null> {
  const id = await shipments.create({ direction }, tx);

  if (order_id) {
    const orderDirection = await orders.directionOf(order_id, tx);
    rules.assertOrderForShipment(orderDirection, order_id);
    const fulfillment = await fulfillmentService.chooseDefault(
      order_id, orderDirection, "SHIPMENT", tx
    );
    await fulfillmentShipments.link(fulfillment.fulfillment.id, id, {}, tx);
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
        link.fulfillment_id,
        patch.shipping_status === "Delivered" ? "COMPLETED" : "PENDING",
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
