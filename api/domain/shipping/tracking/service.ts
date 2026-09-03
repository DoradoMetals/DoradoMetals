// Tracking: the scan events of one shipment, and the shipment they belong to. getEvents returns the whole shipment with its events attached - it asks the shipments service rather than duplicating its composition.
// Events are REPLACED WHOLESALE, not edited: a carrier poll removes what's there and inserts the current set, in one transaction.
import * as tracking from "#db/shipping/tracking/repo.ts";
import * as shipmentService from "#domain/shipping/shipments/service.ts";
import type { ScanEvent, TrackingInfo } from "#db/shipping/tracking/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { ShipmentBaseRow } from "#db/shipping/shipments/repo.ts";

export type { ScanEvent, TrackingInfo } from "#db/shipping/tracking/repo.ts";

// The shipment plus its scan events. scan_events is always an ARRAY, never null - a caller mapping over null is the failure this guards against.
export type TrackedShipment = ShipmentBaseRow & {
  scan_events: {
    status: string | null;
    location: string | null;
    scan_time: Date | string | null;
  }[];
};

export async function getEvents(
  shipment_id: string, executor?: Executor
): Promise<TrackedShipment | null> {
  const shipment = await shipmentService.getById(shipment_id, executor);
  if (!shipment) return null;

  const events = await tracking.getFor(shipment_id, executor);
  // Assigned onto the row rather than spread into a copy - the row is this
  // read's own and a copy is a second object to keep in step.
  return Object.assign(shipment, {
    // The three fields the response has always carried - the event's own id and shipment_id are not part of it.
    scan_events: events.map((e) => ({
      status: e.status,
      location: e.location,
      scan_time: e.scan_time,
    })),
  });
}

// There is no replaceEvents wrapper: the live carrier poll (operations/service.ts) does both writes itself, behind the guard that stops an unrecognised response from emptying a real parcel's history.
// An unguarded second implementation of a write that once deleted five dev shipments' FedEx history is not caution - it's a loaded gun in a drawer.

// A HELPER (ruling 56): getTracking (shipping/operations/service.ts) is the
// only caller, and it opens the transaction both this and insertEvents share.
export async function removeEvents(shipment_id: string, tx: Executor): Promise<boolean> {
  await tracking.remove(shipment_id, tx);
  return true;
}

// A HELPER, same reasoning as removeEvents.
export async function insertEvents(
  trackingInfo: TrackingInfo | null | undefined,
  shipment_id: string,
  tx: Executor
): Promise<number> {
  const events: ScanEvent[] = trackingInfo?.scanEvents ?? [];
  if (!events.length) return 0;

  return await tracking.insert(events, shipment_id, tx);
}
