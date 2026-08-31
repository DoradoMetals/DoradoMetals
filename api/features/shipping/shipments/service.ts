// Shipments: one row in each schema, written together, and an order link that
// only one of the two schemas keeps on the shipment itself.
//
// THE THREE HOPS. shipping.shipments carries no order id, so composing the
// exchange shape means walking fulfillments.shipments -> fulfillments.
// fulfillments -> orders.orders. Each hop is one read of one table, batched
// across every shipment in the answer rather than per row.
import { reportError } from "#shared/observability/report.ts";
import { randomUUID } from "node:crypto";
import withTransaction from "#shared/db/withTransaction.ts";
import * as shipments from "#features/shipping/shipments/repo.ts";
import * as legacy from "#legacy/shipping/shipments/repo.ts";
import * as services from "#features/shipping/services/repo.ts";
import * as packages from "#features/shipping/packages/repo.ts";
import * as fulfillmentLinks from "#features/fulfillments/shipments/repo.ts";
import * as fulfillmentsRepo from "#features/fulfillments/repo.ts";
import * as fulfillmentService from "#features/fulfillments/service.ts";
// The LINK table is its own resource (ruling 26c) - this reaches it directly
// rather than through the fulfillments parent.
import * as fulfillmentShipments from "#features/fulfillments/shipments/service.ts";
import * as orders from "#features/orders/repo.ts";
import * as compose from "#features/shipping/shipments/compose.ts";
import type { ComposedShipment, Lookups, OrderLink } from "#features/shipping/shipments/compose.ts";
import type { ShipmentBaseRow, ShipmentValues } from "#features/shipping/shipments/repo.ts";
import type { Executor } from "#shared/db/executor.ts";

interface HttpError extends Error {
  statusCode?: number;
}

function badRequest(message: string): HttpError {
  const err: HttpError = new Error(message);
  err.statusCode = 400;
  return err;
}

// What a caller supplies to create one. This is exchange's shape, because that
// is what every call site has always sent.
type ShipmentCreate = {
  purchase_order_id?: string | null;
  sales_order_id?: string | null;
  carrier_id?: string | null;
  type?: string | null;
};

// What a caller supplies to update one, again in exchange's shape - `package`
// and `service_type` are NAMES here and the service resolves them.
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

// --------------------------------------------------------------- composition

// THE THREE HOPS, batched. One read per table for the whole answer, which is
// what the four LEFT JOINs bought and what a query per shipment would lose.
async function orderLinks(
  shipment_ids: string[], executor?: Executor
): Promise<Map<string, OrderLink>> {
  const out = new Map<string, OrderLink>();
  if (shipment_ids.length === 0) return out;

  // Hop 1: which fulfillment satisfies each shipment.
  const links = await fulfillmentLinks.getByShipment(shipment_ids, executor);
  if (links.length === 0) return out;

  // Hop 2: which order each fulfillment is for.
  const fulfillments = await fulfillmentsRepo.getMany(
    [...new Set(links.map((l) => l.fulfillment_id))], executor
  );
  const orderOf = new Map(fulfillments.map((f) => [f.id, f.order_id]));

  // Hop 3: which direction that order is, because it decides which column the
  // id lands in.
  const directions = await orders.directionsById(
    [...new Set([...orderOf.values()].filter((id): id is string => id !== null))],
    executor
  );

  for (const link of links) {
    const order_id = orderOf.get(link.fulfillment_id) ?? null;
    out.set(link.shipment_id, {
      order_id,
      direction: order_id === null ? null : (directions.get(order_id) ?? null),
    });
  }
  return out;
}

async function lookupsFor(
  rows: ShipmentBaseRow[], executor?: Executor
): Promise<Lookups> {
  const [serviceRows, packageLabels, links] = await Promise.all([
    services.getAll(executor),
    packages.labelsById(executor),
    orderLinks(rows.map((s) => s.id), executor),
  ]);
  return {
    services: new Map(
      serviceRows.map((s) => [s.id, { name: s.name, carrier_id: s.carrier_id }])
    ),
    packageLabels,
    orderLinks: links,
  };
}

// ------------------------------------------------------------------- reads

export async function getAll(executor?: Executor): Promise<ComposedShipment[]> {
  const rows = await shipments.getAll(executor);
  return compose.composeAll(rows, await lookupsFor(rows, executor));
}

export async function getById(
  id: string, executor?: Executor
): Promise<ComposedShipment | null> {
  const row = await shipments.getOne(id, executor);
  if (!row) return null;
  return compose.compose(row, await lookupsFor([row], executor));
}

// Several shipments by id - getById, batched, and missing ids simply absent.
//
// `lookupsFor` was always keyed by shipment id, so composing n rows together
// resolves each one exactly as composing it alone did. Its caller is
// features/shipping/pickups, which reconstructs a pickup's order and carrier
// through its shipment and did so one shipment at a time until D101.
export async function getManyById(
  ids: string[], executor?: Executor
): Promise<ComposedShipment[]> {
  if (ids.length === 0) return [];
  const rows = await shipments.getMany([...new Set(ids)], executor);
  if (rows.length === 0) return [];
  return compose.composeAll(rows, await lookupsFor(rows, executor));
}

// Returns ONE shipment, not a list, matching the implementation it replaces -
// an order can legitimately have more than one and both implementations took
// the first.
//
// Read by walking the link the other way: the order's fulfillment names the
// shipment. That is the same three hops in reverse and needs no scan.
export async function getByOrder(
  order_id: string, executor?: Executor
): Promise<ComposedShipment | null> {
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
// D101. `getByOrder` is four statements plus the five `getById` costs, and the
// composed order read called it once per order - on a database 178 ms away
// that made a 48-order list 38 seconds. This walks the identical three hops
// with `= ANY($1)` at every one, so the cost is the same whether one order is
// asked for or fifty.
//
// EQUIVALENT TO CALLING getByOrder PER ORDER, deliberately and in every
// detail. `fulfillments_order_uniq` gives at most one fulfillment per order;
// get_many.sql now orders by id ASC like get_for.sql, so "the first parcel" is
// the same parcel; and `lookupsFor` was already batched, keyed by shipment id,
// so composing many rows at once resolves each exactly as composing one did.
// An order with no fulfillment, or a fulfillment with no parcel, is ABSENT
// from the map rather than present with null - which is what `null` meant.
export async function getByOrders(
  order_ids: string[], executor?: Executor
): Promise<Map<string, ComposedShipment>> {
  const out = new Map<string, ComposedShipment>();
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

  // Hop 3: the parcels themselves, composed together.
  const shipmentOf = new Map<string, string>();
  for (const f of fulfillments) {
    const shipment_id = firstLinkOf.get(f.id);
    if (shipment_id && f.order_id !== null) shipmentOf.set(f.order_id, shipment_id);
  }
  const wanted = [...new Set(shipmentOf.values())];
  if (wanted.length === 0) return out;

  const rows = await shipments.getMany(wanted, executor);
  const composed = new Map(
    compose.composeAll(rows, await lookupsFor(rows, executor)).map((c) => [c.id, c])
  );

  for (const [order_id, shipment_id] of shipmentOf) {
    const c = composed.get(shipment_id);
    if (c) out.set(order_id, c);
  }
  return out;
}

// ------------------------------------------------------------------ writes

// Creating a shipment is creating THREE things in the new schema - the shipment,
// the fulfillment that says which order it belongs to, and the link between
// them - and one row in exchange.
//
// THE FULFILLMENT IS BEST-EFFORT, DELIBERATELY. It references orders.orders,
// which only holds orders the dual-write or the backfill has reached, and
// PRODUCTION HAS 15 PURCHASE ORDERS THAT ARE NOT THERE. The mirror this
// replaces skipped the fulfillment for those with an `AND EXISTS` guard rather
// than failing, and so does this: a shipment that cannot be linked yet is still
// a real parcel with a real label, and refusing to create it would stop an
// order shipping over a migration detail. It composes with null order ids,
// which is exactly what exchange shows for a shipment with no order.
export async function create(
  input: ShipmentCreate, executor?: Executor
): Promise<ComposedShipment | null> {
  const order_id = input.purchase_order_id ?? input.sales_order_id ?? null;
  const direction = input.purchase_order_id ? "purchase" : "sale";

  // exchange's `type` is Inbound/Outbound and the new schema's `direction` is
  // its own enum. The mirror cast one to the other; the values match.
  const shipmentDirection = input.type ?? null;
  if (!shipmentDirection) {
    throw badRequest("a shipment needs a type - shipping.shipments.direction is NOT NULL");
  }

  const run = async (c: Executor): Promise<ComposedShipment | null> => {
    const id = randomUUID();
    await shipments.create(id, shipmentDirection, c);
    await legacy.create(id, input, c);

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
): Promise<ComposedShipment | null> {
  if (!input.id) throw badRequest("a shipment update needs an id");
  const id = input.id;

  const run = async (c: Executor): Promise<ComposedShipment | null> => {
    // A SERVICE NAME WITH NO CARRIER USED TO BE SILENTLY DROPPED.
    //
    // exchange stores service_type as TEXT and takes it regardless; the new
    // schema needs a reference, and a service is identified by (carrier, name).
    // Resolving only when both are present meant a caller who sent a service
    // and no carrier got a shipment with no service at all - and would find out
    // on the next read, not on the write. Refused instead.
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

    const values: ShipmentValues = [
      input.tracking_number ?? null,
      input.shipping_status ?? null,
      input.estimated_delivery ?? null,
      input.shipped_at ?? null,
      input.delivered_at ?? null,
      input.shipping_label ?? null,
      input.label_type ?? null,
      input.pickup_type ?? null,
      package_id,
      carrier_service_id,
      input.net_charge ?? null,
      input.insured === true,
      input.declared_value ?? null,
      input.type ?? null,
    ];

    const written = await shipments.update(id, values, c);
    if (!written) return null;

    // DELIVERED IS WHAT COMPLETES A FULFILLMENT, and losing that would leave an
    // order looking unfulfilled after it arrived. The mirror this replaces did
    // it in the fulfillment upsert:
    //
    //   CASE WHEN e.shipping_status = 'Delivered' THEN 'COMPLETED' ELSE 'PENDING' END
    //
    // Both arms are kept, including the ELSE: a shipment moved back off
    // Delivered - a mis-scan, a return - reopens its fulfillment, which is what
    // the mirror did on the next write.
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

    // exchange takes the NAMES where the new schema took the ids, and carries
    // carrier_id itself. Everything else is the same value in the same place.
    await legacy.update(id, [
      ...values.slice(0, 8),
      input.package ?? null,
      input.service_type ?? null,
      ...values.slice(10, 14),
      input.carrier_id ?? null,
    ] as legacy.LegacyValues, c);

    return await getById(id, c);
  };
  return executor ? await run(executor) : await withTransaction(run);
}

// The shipping cost of an order's parcels, written to both schemas.
//
// This exists because purchase-orders used to do
// `UPDATE exchange.shipments SET net_charge` itself (D41). It owns neither the
// table nor the three hops that find it from an order, and after its pivot it
// would have been the one writer that did not dual-write - so a charge edited
// on the purchase-order screen would land in exchange alone while every other
// field of that shipment landed in both.
//
// THE TWO HALVES MAY UPDATE DIFFERENT NUMBERS OF ROWS, AND THAT IS NOT AN
// ERROR TODAY. While a switch is on `exchange` the new schema holds only what
// the backfill last put there, so an order shipped since then exists in
// exchange and not yet in shipping.shipments. Throwing on a mismatch would
// break a working screen to report a condition the migration creates by
// design. The exchange ids are returned because exchange is still
// authoritative; the dual-write test is where the two are held to agree, for
// orders that exist in both.
export async function setChargeForOrder(
  orderId: string, cost: number | null, executor?: Executor
): Promise<string[]> {
  const run = async (c: Executor): Promise<string[]> => {
    // THE NATIVE HALF'S RESULT IS NO LONGER DROPPED. The comment above says the
    // exchange ids are returned "because exchange is still authoritative" - and
    // ruling 36 retires that: when the legacy half goes, this silent half is the
    // only half. The native statement joins three tables (shipping.shipments ->
    // fulfillments.shipments -> fulfillments.fulfillments -> the order), so any
    // hop failing to resolve updates nothing and says nothing. D190, D202.
    //
    // Compared against the legacy half rather than asserted on its own: legacy
    // matching nothing too means the order simply has no parcels, which is not
    // an error. The two DISAGREEING is.
    const native = await shipments.setChargeForOrder(orderId, cost, c);
    const legacyIds = await legacy.setChargeForOrder(orderId, cost, c);
    if (legacyIds.length > 0 && native.length === 0) {
      reportError({
        at: "shipping.shipments.setChargeForOrder",
        message:
          `exchange updated ${legacyIds.length} shipment(s) on order ${orderId} ` +
          `and the new schema updated none - the shipping charge is recorded in ` +
          `one schema only`,
        extra: { order_id: orderId, legacy_rows: legacyIds.length },
      });
    }
    return legacyIds;
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
    await legacy.remove(id, c);
    return true;
  };
  return executor ? await run(executor) : await withTransaction(run);
}
