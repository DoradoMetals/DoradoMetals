// ONE PARCEL, WHOLE: the shipment, the rows it names by id, its carrier
// booking, its progress and what may be done to it.
//
// Every piece of this was assembled in a browser. `useShipmentDisplay` held the
// carrier-services list and `find`-ed the shipment's service to learn its name
// and its carrier - a join. The dropoff instructions held the packages list and
// `find`-ed the box, falling back to the first offered one. A drawer called
// `useShipmentPickups` for a carrier booking it only ever read `[0]` of. And
// `TrackingEvents.tsx` derived the whole progress ladder from raw scan rows.
//
// One read answers all of it, so a screen renders rather than reasons.
import * as shipments from "#db/shipping/shipments/repo.ts";
import * as servicesRepo from "#db/shipping/services/repo.ts";
import * as packagesRepo from "#db/shipping/packages/repo.ts";
import * as carrierPickups from "#db/shipping/pickups/repo.ts";
import * as trackingRepo from "#db/shipping/tracking/repo.ts";
import * as rules from "#domain/shipping/rules.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { ShipmentRead, ShipmentView } from "@dorado/contracts";

// Sequential, not Promise.all: these reads share the caller's transaction
// client whenever one is open, and a single pg client runs one statement at a
// time.
async function composeOne(
  shipment: ShipmentRead, isAdmin: boolean, executor?: Executor
): Promise<ShipmentView> {
  const service = shipment.carrier_service_id
    ? (await servicesRepo.getOne(shipment.carrier_service_id, executor)) ?? null
    : null;
  const box = shipment.package_id
    ? (await packagesRepo.getOne(shipment.package_id, executor)) ?? null
    : null;
  // The MOST RECENT booking, which is what get_by_shipments orders by: a
  // rebooking supersedes the attempt before it, and every consumer of the old
  // list took the first row anyway.
  const [carrier_pickup] = await carrierPickups.getByShipments([shipment.id], executor);
  const events = await trackingRepo.getFor(shipment.id, executor);

  const timeline = rules.trackingTimeline(events);
  const carrier_id = service?.carrier_id ?? null;

  return {
    shipment,
    service,
    // Not a column of shipping.shipments and never was: the SERVICE knows its
    // carrier. Resolved here because three admin calls need it and each was
    // resolving it off a cached list of its own.
    carrier_id,
    package: box,
    carrier_pickup: carrier_pickup ?? null,
    handoff_at: carrier_pickup?.requested_at ?? null,
    tracking_status: rules.trackingStatus(shipment.shipping_status, timeline),
    timeline,
    actions: rules.shipmentActions(shipment, { carrier_id, isAdmin }),
  };
}

export async function getById(
  id: string, isAdmin: boolean, executor?: Executor
): Promise<ShipmentView | null> {
  const shipment = await shipments.getRead(id, executor);
  if (!shipment) return null;
  return await composeOne(shipment, isAdmin, executor);
}

// GET /api/orders/:orderId/shipments - the order's parcels, both directions in
// one array. The caller filters on the row's own `direction`; there are no
// shipment / return_shipment slots.
export async function forOrder(
  order_id: string, isAdmin: boolean, executor?: Executor
): Promise<ShipmentView[]> {
  const rows = await shipments.getReadForOrder(order_id, executor);
  const out: ShipmentView[] = [];
  for (const row of rows) out.push(await composeOne(row, isAdmin, executor));
  return out;
}
