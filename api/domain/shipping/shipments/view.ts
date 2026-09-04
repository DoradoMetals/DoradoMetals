import * as shipments from "#db/shipping/shipments/repo.ts";
import * as servicesRepo from "#db/shipping/services/repo.ts";
import * as packagesRepo from "#db/shipping/packages/repo.ts";
import * as carrierPickups from "#db/shipping/pickups/repo.ts";
import * as trackingRepo from "#db/shipping/tracking/repo.ts";
import * as rules from "#domain/shipping/rules.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { ShipmentRead, ShipmentView } from "@dorado/contracts";

async function composeOne(
  shipment: ShipmentRead, isAdmin: boolean, executor?: Executor
): Promise<ShipmentView> {
  const service = shipment.carrier_service_id
    ? (await servicesRepo.getOne(shipment.carrier_service_id, executor)) ?? null
    : null;
  const box = shipment.package_id
    ? (await packagesRepo.getOne(shipment.package_id, executor)) ?? null
    : null;
  const [carrier_pickup] = await carrierPickups.getByShipments([shipment.id], executor);
  const events = await trackingRepo.getFor(shipment.id, executor);

  const timeline = rules.trackingTimeline(events);
  const carrier_id = service?.carrier_id ?? null;

  return {
    shipment,
    service,
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

export async function forOrder(
  order_id: string, isAdmin: boolean, executor?: Executor
): Promise<ShipmentView[]> {
  const rows = await shipments.getReadForOrder(order_id, executor);
  const out: ShipmentView[] = [];
  for (const row of rows) out.push(await composeOne(row, isAdmin, executor));
  return out;
}
