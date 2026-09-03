// Shipments: shipping.shipments, plus the fulfillment link that says which order (if any) a parcel belongs to.
// Reads are the verbatim row - no compose step reconstructing exchange's flat shape; every caller here reads shipping.shipments as the repo returns it.
// getByOrder/getByOrders still walk fulfillments.shipments -> fulfillments.fulfillments to resolve an order's parcel - that's resolution, not shape.
import { randomUUID } from "node:crypto";
import * as shipments from "#db/shipping/shipments/repo.ts";
import * as services from "#db/shipping/services/repo.ts";
import * as packages from "#db/shipping/packages/repo.ts";
import * as fulfillmentLinks from "#db/fulfillments/shipments/repo.ts";
import * as fulfillmentsRepo from "#db/fulfillments/repo.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
// The LINK table is its own resource - reached directly, not through the fulfillments parent.
import * as fulfillmentShipments from "#domain/fulfillments/shipments/service.ts";
import * as orders from "#db/orders/repo.ts";
import { Invalid, NotFound } from "#shared/errors.ts";
import type { ShipmentBaseRow, ShipmentRecord } from "#db/shipping/shipments/repo.ts";
import type { Executor } from "#shared/db/executor.ts";

// Order direction is read off the order row, never accepted as input.
type ShipmentCreate = {
  order_id?: string | null;
  type?: string | null;
};

// package/service_type are NAMES (what the carrier integration produces) - resolved to ids here. Every timestamp is `Date | string`: call sites spread an already-read shipment, and pg has parsed those into Date objects going into a timestamptz.
// shipping_label is `string | Buffer` too: FedEx returns a base64 buffer and one call site passes it through unconverted into a text column - worth a second look.
type ShipmentUpdate = {
  id: string;
  tracking_number?: string | null;
  shipping_status?: string | null;
  carrier_id?: string | null;
  estimated_delivery?: Date | string | null;
  shipped_at?: Date | string | null;
  delivered_at?: Date | string | null;
  shipping_label?: string | Buffer | null;
  label_type?: string | null;
  pickup_type?: string | null;
  package?: string | null;
  service_type?: string | null;
  net_charge?: number | null;
  insured?: boolean | null;
  declared_value?: number | null;
  type?: string | null;
};

// ------------------------------------------------------------------- reads

export async function getAll(executor?: Executor): Promise<ShipmentBaseRow[]> {
  return await shipments.getAll(executor);
}

export async function getById(
  id: string, executor?: Executor
): Promise<ShipmentBaseRow | null> {
  return (await shipments.getOne(id, executor)) ?? null;
}

export async function getManyById(
  ids: string[], executor?: Executor
): Promise<ShipmentBaseRow[]> {
  if (ids.length === 0) return [];
  return await shipments.getMany([...new Set(ids)], executor);
}

// Returns ONE shipment, not a list - an order can legitimately have more than one; this takes the first.
export async function getByOrder(
  order_id: string, executor?: Executor
): Promise<ShipmentBaseRow | null> {
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
): Promise<Map<string, ShipmentBaseRow>> {
  const out = new Map<string, ShipmentBaseRow>();
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
export type OrderLink = { order_id: string; direction: string };

export async function getOrderLink(
  shipment_id: string, executor?: Executor
): Promise<OrderLink | null> {
  const [link] = await fulfillmentLinks.getByShipment([shipment_id], executor);
  if (!link) return null;
  const fulfillment = await fulfillmentsRepo.getOne(link.fulfillment_id, executor);
  if (!fulfillment?.order_id) return null;
  const direction = await orders.directionOf(fulfillment.order_id, executor);
  if (!direction) return null;
  return { order_id: fulfillment.order_id, direction };
}

// ------------------------------------------------------------------ writes

export async function create(
  input: ShipmentCreate, tx: Executor
): Promise<ShipmentBaseRow | null> {
  const shipmentDirection = input.type ?? null;
  if (!shipmentDirection) {
    throw new Invalid("a shipment needs a type - shipping.shipments.direction is NOT NULL");
  }

  const id = randomUUID();
  await shipments.create({ id, direction: shipmentDirection }, tx);

  if (input.order_id) {
    const direction = await orders.directionOf(input.order_id, tx);
    if (!direction) {
      throw new NotFound(
        `order ${input.order_id} does not exist - a shipment cannot attach to it`
      );
    }
    const fulfillment = await fulfillmentService.chooseDefault(
      { order_id: input.order_id, direction, category: "SHIPMENT" }, tx
    );
    if (!fulfillment) {
      throw new Error(
        `order ${input.order_id}: no fulfillment could be ensured for this shipment - ` +
          `this transaction must not commit`
      );
    }
    await fulfillmentShipments.link(
      { fulfillment_id: fulfillment.id, shipment_id: id }, tx
    );
  }

  return await getById(id, tx);
}

// service_type/package arrive as NAMES (what the carrier integration produces), resolved here - a not-found is thrown, not silently written as null.
// `tx` is REQUIRED - the caller (a use case, or a test's own transaction) opens it; this never does.
export async function update(
  input: ShipmentUpdate, tx: Executor
): Promise<ShipmentBaseRow | null> {
  if (!input.id) throw new Invalid("a shipment update needs an id");
  const id = input.id;

  // A service name with no carrier used to be silently dropped - now refused.
  if (input.service_type && !input.carrier_id) {
    throw new Invalid(
      `a service name needs a carrier to resolve against - ` +
        `${JSON.stringify(input.service_type)} was sent without one`
    );
  }
  if (input.package && !input.carrier_id) {
    throw new Invalid(
      `a package label needs a carrier to resolve against - ` +
        `${JSON.stringify(input.package)} was sent without one`
    );
  }

  let carrier_service_id: string | null = null;
  if (input.service_type && input.carrier_id) {
    const all = await services.getByCarrier(input.carrier_id, tx);
    carrier_service_id = all.find((s) => s.name === input.service_type)?.id ?? null;
    if (!carrier_service_id) {
      throw new NotFound(
        `carrier ${input.carrier_id} offers no service called ${JSON.stringify(input.service_type)}`
      );
    }
  }

  let package_id: string | null = null;
  if (input.package && input.carrier_id) {
    const found = await packages.find(input.carrier_id, input.package, tx);
    package_id = found?.id ?? null;
    if (!package_id) {
      throw new NotFound(
        `carrier ${input.carrier_id} has no package called ${JSON.stringify(input.package)}`
      );
    }
  }

  const row: ShipmentRecord = {
    tracking_number: input.tracking_number,
    shipping_status: input.shipping_status,
    est_delivery: input.estimated_delivery,
    shipped_at: input.shipped_at,
    delivered_at: input.delivered_at,
    label: input.shipping_label,
    label_type: input.label_type,
    pickup_type: input.pickup_type,
    package_id,
    carrier_service_id,
    cost: input.net_charge,
    insured: input.insured === true,
    declared_value: input.declared_value,
    direction: input.type,
  };

  const written = await shipments.update(id, row, tx);
  if (!written) return null;

  // DELIVERED IS WHAT COMPLETES A FULFILLMENT.
  if (input.shipping_status) {
    const [link] = await fulfillmentLinks.getByShipment([id], tx);
    if (link) {
      await fulfillmentService.setStatus(
        {
          id: link.fulfillment_id,
          status: input.shipping_status === "Delivered" ? "COMPLETED" : "PENDING",
        },
        tx
      );
    }
  }

  return await getById(id, tx);
}

// A read-modify-write for callers holding a shipment's own ids (carrier_service_id, package_id) that want to change a column or two without resolving anything by name.
// Reads the row fresh and writes back every column verbatim except what changed - full-replace semantics without ever needing a name.
// `tx` is REQUIRED, same reason as update().
export async function patch(
  id: string, changes: Partial<ShipmentRecord>, tx: Executor
): Promise<ShipmentBaseRow | null> {
  const existing = await shipments.getOne(id, tx);
  if (!existing) return null;

  // Assigned onto a plain record rather than spread into a copy - every
  // column starts at its current value, and `changes` overrides only what
  // it names, matching shipments.update's own full-replace contract.
  const merged: ShipmentRecord = {
    tracking_number: existing.tracking_number,
    shipping_status: existing.shipping_status,
    est_delivery: existing.est_delivery,
    shipped_at: existing.shipped_at,
    delivered_at: existing.delivered_at,
    label: existing.label,
    label_type: existing.label_type,
    pickup_type: existing.pickup_type,
    package_id: existing.package_id,
    carrier_service_id: existing.carrier_service_id,
    cost: existing.cost,
    insured: existing.insured ?? undefined,
    declared_value: existing.declared_value,
    direction: existing.direction,
  };
  Object.assign(merged, changes);

  const written = await shipments.update(id, merged, tx);
  if (!written) return null;
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
