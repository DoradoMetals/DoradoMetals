// Shipments: shipping.shipments, plus the fulfillment link that says which
// order (if any) a parcel belongs to.
//
// THE READ IS THE ROW (ruling 12, D214). compose.ts is deleted - it rebuilt
// exchange.shipments' flat shape (purchase_order_id/sales_order_id split,
// service_type/package resolved to names, carrier_id through the service) on
// every read, and nothing needs that shape any more: /orders/:orderId/shipments
// (order-read.ts) already served verbatim rows, and every internal caller here
// is converted to read shipping.shipments as the repo returns it.
//
// getByOrder/getByOrders still WALK fulfillments.shipments -> fulfillments.
// fulfillments to find which shipment(s) belong to an order - that is
// resolution, not shape (CLAUDE.md's carve-out for chain-resolving reads), and
// callers that hold an order id and want its parcel still need it.
import { randomUUID } from "node:crypto";
import withTransaction from "#shared/db/withTransaction.ts";
import * as shipments from "#db/shipping/shipments/repo.ts";
import * as services from "#db/shipping/services/repo.ts";
import * as packages from "#db/shipping/packages/repo.ts";
import * as fulfillmentLinks from "#db/fulfillments/shipments/repo.ts";
import * as fulfillmentsRepo from "#db/fulfillments/repo.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
// The LINK table is its own resource (ruling 26c) - this reaches it directly
// rather than through the fulfillments parent.
import * as fulfillmentShipments from "#domain/fulfillments/shipments/service.ts";
import * as orders from "#db/orders/repo.ts";
import type { ShipmentBaseRow, ShipmentRecord } from "#db/shipping/shipments/repo.ts";
import type { Executor } from "#shared/db/executor.ts";

interface HttpError extends Error {
  statusCode?: number;
}

function badRequest(message: string): HttpError {
  const err: HttpError = new Error(message);
  err.statusCode = 400;
  return err;
}

// What a caller supplies to create one. Unchanged by this wave - a WRITE, not
// a read - because it is what every call site already sends: an order to link
// against (which one of the two depends on which is present) and the carrier
// picked for it.
type ShipmentCreate = {
  purchase_order_id?: string | null;
  sales_order_id?: string | null;
  carrier_id?: string | null;
  type?: string | null;
};

// What a caller supplies to update one. Also unchanged: `package` and
// `service_type` are NAMES here because that is what exchange stored and what
// the carrier integration produces, and this resolves them to references - a
// WRITE-side concern, independent of what a read now returns.
//
// THE TYPES ADMIT WHAT CALLERS ACTUALLY PASS, which is wider than it looks.
// Every timestamp is `Date | string`: the call sites spread a shipment they
// just read, and pg has already parsed those columns into Date objects.
// Narrowing them to `string` would be a claim about the caller that the
// compiler immediately disproved. They go straight into a timestamptz, which
// takes either.
//
// `shipping_label` is `string | Buffer` for the same reason: FedEx returns the
// label as a base64 buffer and one call site passes it through unconverted.
// That is worth a second look one day - it is stored in a text column - but it
// is what happens today and the type says so rather than pretending.
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

// Returns ONE shipment, not a list, matching the implementation it replaces -
// an order can legitimately have more than one and both implementations took
// the first.
export async function getByOrder(
  order_id: string, executor?: Executor
): Promise<ShipmentBaseRow | null> {
  const fulfillment = await fulfillmentsRepo.getByOrder(order_id, executor);
  if (!fulfillment) return null;

  // A fulfillment may have several parcels; the first is the one every caller
  // has always been given - both implementations took `rows[0]`.
  const [link] = await fulfillmentLinks.getFor(fulfillment.id, executor);
  if (!link) return null;

  return await getById(link.shipment_id, executor);
}

// THE SAME READ FOR A LIST OF ORDERS, IN A FIXED NUMBER OF ROUND TRIPS.
//
// D101. Walks the identical hops with `= ANY($1)` at every one, so the cost is
// the same whether one order is asked for or fifty. An order with no
// fulfillment, or a fulfillment with no parcel, is ABSENT from the map.
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

// Which order this shipment is linked to, and which direction that order is -
// NOT the shipment's shape (ruling 12 retired the purchase_order_id /
// sales_order_id split that used to live on every row), but resolution a
// caller genuinely needs to route a write to the right order-side table
// (patch.service.ts: a shipping charge is a purchase-order field, tracking is
// a sales-order one). Chain-resolving, same carve-out as getByOrder above.
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

// Creating a shipment is creating THREE rows - the shipment, the fulfillment
// that says which order it belongs to, and the link between them.
//
// THE FULFILLMENT IS BEST-EFFORT, DELIBERATELY. It references orders.orders,
// and PRODUCTION HAS 15 PURCHASE ORDERS THAT ARE NOT THERE - a shipment that
// cannot be linked yet is still a real parcel with a real label, and refusing
// to create it would stop an order shipping over a migration detail.
export async function create(
  input: ShipmentCreate, executor?: Executor
): Promise<ShipmentBaseRow | null> {
  const order_id = input.purchase_order_id ?? input.sales_order_id ?? null;
  const direction = input.purchase_order_id ? "purchase" : "sale";

  // exchange's `type` is Inbound/Outbound and the new schema's `direction` is
  // its own enum. The mirror cast one to the other; the values match.
  const shipmentDirection = input.type ?? null;
  if (!shipmentDirection) {
    throw badRequest("a shipment needs a type - shipping.shipments.direction is NOT NULL");
  }

  const run = async (c: Executor): Promise<ShipmentBaseRow | null> => {
    const id = randomUUID();
    await shipments.create({ id, direction: shipmentDirection }, c);

    if (order_id && (await orders.exists(order_id, c))) {
      const fulfillment = await fulfillmentService.chooseDefault(
        { order_id, direction, category: "SHIPMENT" }, c
      );
      if (fulfillment) {
        await fulfillmentShipments.link(
          { fulfillment_id: fulfillment.id, shipment_id: id }, c
        );
      }
    }

    return await getById(id, c);
  };
  return executor ? await run(executor) : await withTransaction(run);
}

// The service and package arrive as NAMES, because that is what exchange
// stores and what the carrier integration produces. Resolved here, and named
// when they cannot be found - the alternative is writing a null into a column
// that means "no service" and discovering it on the next read.
export async function update(
  input: ShipmentUpdate, executor?: Executor
): Promise<ShipmentBaseRow | null> {
  if (!input.id) throw badRequest("a shipment update needs an id");
  const id = input.id;

  const run = async (c: Executor): Promise<ShipmentBaseRow | null> => {
    // A SERVICE NAME WITH NO CARRIER USED TO BE SILENTLY DROPPED.
    if (input.service_type && !input.carrier_id) {
      throw badRequest(
        `a service name needs a carrier to resolve against - ` +
          `${JSON.stringify(input.service_type)} was sent without one`
      );
    }
    if (input.package && !input.carrier_id) {
      throw badRequest(
        `a package label needs a carrier to resolve against - ` +
          `${JSON.stringify(input.package)} was sent without one`
      );
    }

    let carrier_service_id: string | null = null;
    if (input.service_type && input.carrier_id) {
      const all = await services.getByCarrier(input.carrier_id, c);
      carrier_service_id = all.find((s) => s.name === input.service_type)?.id ?? null;
      if (!carrier_service_id) {
        throw badRequest(
          `carrier ${input.carrier_id} offers no service called ${JSON.stringify(input.service_type)}`
        );
      }
    }

    let package_id: string | null = null;
    if (input.package && input.carrier_id) {
      const found = await packages.find(input.carrier_id, input.package, c);
      package_id = found?.id ?? null;
      if (!package_id) {
        throw badRequest(
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

    const written = await shipments.update(id, row, c);
    if (!written) return null;

    // DELIVERED IS WHAT COMPLETES A FULFILLMENT.
    if (input.shipping_status) {
      const [link] = await fulfillmentLinks.getByShipment([id], c);
      if (link) {
        await fulfillmentService.setStatus(
          {
            id: link.fulfillment_id,
            status: input.shipping_status === "Delivered" ? "COMPLETED" : "PENDING",
          },
          c
        );
      }
    }

    return await getById(id, c);
  };
  return executor ? await run(executor) : await withTransaction(run);
}

// A read-modify-write for internal callers that already hold a shipment's OWN
// ids (carrier_service_id, package_id) and want to change one or two native
// columns without resolving anything by name - cancelLabel and getTracking in
// operations/service.ts, and updateTracking in orders/service.ts, each used to
// spread the COMPOSED shipment back into update() above, which only
// round-tripped safely because the composed shape carried service_type/
// package NAMES the resolver could turn back into the same ids. A bare row
// does not carry those names, so this reads the row fresh and writes back
// every column verbatim except what changed - the "ONE UPDATE" ruling's
// full-replace semantics, satisfied without ever needing a name.
export async function patch(
  id: string, changes: Partial<ShipmentRecord>, executor?: Executor
): Promise<ShipmentBaseRow | null> {
  const run = async (c: Executor): Promise<ShipmentBaseRow | null> => {
    const existing = await shipments.getOne(id, c);
    if (!existing) return null;

    const written = await shipments.update(
      id,
      {
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
        ...changes,
      },
      c
    );
    if (!written) return null;
    return await getById(id, c);
  };
  return executor ? await run(executor) : await withTransaction(run);
}

// The shipping cost of every parcel on one order. Native-only since the purge
// (D212): a zero-row update here means the order simply has no parcels, which
// is not an error.
export async function setChargeForOrder(
  orderId: string, cost: number | null, executor?: Executor
): Promise<string[]> {
  const run = async (c: Executor): Promise<string[]> => {
    return await shipments.setChargeForOrder(orderId, cost, c);
  };
  return executor ? await run(executor) : await withTransaction(run);
}

// The link goes first: fulfillments.shipments references the shipment. The
// fulfillment itself is left alone, because an order can be fulfilled without a
// surviving shipment record.
export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const run = async (c: Executor): Promise<boolean> => {
    await fulfillmentLinks.removeByShipment(id, c);
    await shipments.remove(id, c);
    return true;
  };
  return executor ? await run(executor) : await withTransaction(run);
}
