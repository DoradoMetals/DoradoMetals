// Shipments: shipping.shipments, plus the fulfillment link that says which order (if any) a parcel belongs to.
// Reads are the verbatim row - no compose step reconstructing exchange's flat shape; every caller here reads shipping.shipments as the repo returns it.
// getByOrder/getByOrders still walk fulfillments.shipments -> fulfillments.fulfillments to resolve an order's parcel - that's resolution, not shape.
import { randomUUID } from "node:crypto";
import * as shipments from "#db/shipping/shipments/repo.ts";
import * as fulfillmentLinks from "#db/fulfillments/shipments/repo.ts";
import * as fulfillmentsRepo from "#db/fulfillments/repo.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
// The LINK table is its own resource - reached directly, not through the fulfillments parent.
import * as fulfillmentShipments from "#domain/fulfillments/shipments/service.ts";
import * as orders from "#db/orders/repo.ts";
import * as rules from "#domain/shipping/rules.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { Direction, OrderViewShipment, ShipmentDirection, ShipmentWrite } from "@dorado/contracts";

// ------------------------------------------------------------------- reads

export async function getAll(executor?: Executor): Promise<OrderViewShipment[]> {
  return await shipments.getAll(executor);
}

export async function getById(
  id: string, executor?: Executor
): Promise<OrderViewShipment | null> {
  return (await shipments.getOne(id, executor)) ?? null;
}

export async function getManyById(
  ids: string[], executor?: Executor
): Promise<OrderViewShipment[]> {
  if (ids.length === 0) return [];
  return await shipments.getMany([...new Set(ids)], executor);
}

// Returns ONE shipment, not a list - an order can legitimately have more than one; this takes the first.
export async function getByOrder(
  order_id: string, executor?: Executor
): Promise<OrderViewShipment | null> {
  const fulfillment = await fulfillmentsRepo.getByOrder(order_id, executor);
  if (!fulfillment) return null;

  // A fulfillment may have several parcels; the first is the one every caller is given.
  const [link] = await fulfillmentLinks.getFor(fulfillment.id, executor);
  if (!link) return null;

  return await getById(link.shipment_id, executor);
}

// Same read for a list of orders, in a fixed number of round trips - walks the identical hops with `= ANY($1)`. An order or fulfillment with nothing to find is simply absent from the map.
export async function getByOrders(
  order_ids: string[], executor?: Executor
): Promise<Map<string, OrderViewShipment>> {
  const out = new Map<string, OrderViewShipment>();
  const ids = [...new Set(order_ids)];
  if (ids.length === 0) return out;

  // Hop 1: the fulfillment of each order.
  const fulfillments = await fulfillmentsRepo.getByOrders(ids, executor);
  if (fulfillments.length === 0) return out;

  // Hop 2: its parcels, and the FIRST of them - `getFor(...)[0]` batched.
  const links = await fulfillmentLinks.getMany(fulfillments.map((f) => f.id), executor);
  const firstLinkOf = new Map<string, string>();
  for (const link of links) {
    if (!firstLinkOf.has(link.fulfillment_id)) {
      firstLinkOf.set(link.fulfillment_id, link.shipment_id);
    }
  }

  // Hop 3: the parcels themselves.
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

// Which order/direction this shipment belongs to - not the shipment's shape, but resolution patch.service.ts needs to route a write to the right order-side table.
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

// ------------------------------------------------------------------ writes

// A SHELL, and the fulfillment link that says which order it is for. Named
// arguments rather than an input object: `direction` is shipping's own
// (Inbound/Outbound/Return) and the ORDER's direction is read off the order
// row, never accepted - the two share a word and nothing else.
export async function create(
  { order_id, direction }: { order_id?: string | null; direction: ShipmentDirection },
  tx: Executor
): Promise<OrderViewShipment | null> {
  const id = randomUUID();
  await shipments.create({ id, direction }, tx);

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

// A COLUMN OR TWO, KEYED BY ID. Everything the caller does not name is left
// alone by the statement itself (db/shipping/shipments/repo.ts), so nothing
// here reads the row first to copy it back.
//
// It replaces two functions. `update()` took names - a carrier's service and
// package spelled out - and resolved each against the catalogue before
// writing; it had no production caller left, only tests, and its whole reason
// for existing was that the repo's UPDATE was a full replace. `patch()` was the
// read-modify-write that same full replace forced on every other caller.
//
// DELIVERED IS WHAT COMPLETES A FULFILLMENT, and that rule moved here with
// them. It used to live in `update()`, which nothing called, so a parcel the
// carrier reported as delivered left its fulfillment PENDING forever - the
// tracking poll writes through this function.
// `tx` is REQUIRED: the caller (a use case, or a test's own transaction) opens
// it; this never does.
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

// The shipping cost of every parcel on one order - a zero-row update just means the order has no parcels, not an error.
// `tx` is REQUIRED, same reason as update().
export async function setChargeForOrder(
  orderId: string, cost: number | null, tx: Executor
): Promise<string[]> {
  return await shipments.setChargeForOrder(orderId, cost, tx);
}

// The link goes first: fulfillments.shipments references the shipment. The
// fulfillment itself is left alone, because an order can be fulfilled without a
// surviving shipment record. `tx` is REQUIRED, same reason as update().
export async function remove(id: string, tx: Executor): Promise<boolean> {
  await fulfillmentLinks.removeByShipment(id, tx);
  await shipments.remove(id, tx);
  return true;
}
