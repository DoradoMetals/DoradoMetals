// Tracking: the scan events of one shipment, and the shipment they belong to.
//
// getEvents returns the WHOLE SHIPMENT with its events attached, not just the
// events - which is why this depends on the shipments service rather than
// duplicating its composition. The implementation this replaces imported
// SHIPMENT_COLUMNS and SHIPMENT_FROM from the shipments repo and re-ran the
// same four joins with a fifth for the events; here it asks the service.
//
// Events are REPLACED WHOLESALE rather than edited: a carrier poll removes what
// is there and inserts the current set. Both schemas do the same thing, in one
// transaction, so the two cannot drift apart between polls.
import withTransaction from "#shared/db/withTransaction.ts";
import * as tracking from "#features/shipping/tracking/repo.ts";
import * as legacy from "#legacy/shipping/tracking/repo.ts";
import * as shipmentService from "#features/shipping/shipments/service.ts";
import type { ScanEvent, TrackingInfo } from "#features/shipping/tracking/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { ComposedShipment } from "#features/shipping/shipments/compose.ts";

export type { ScanEvent, TrackingInfo } from "#features/shipping/tracking/repo.ts";

// The shipment, plus its scan events under the name the response has always
// used. `scan_events` is an ARRAY and is `[]` rather than null when there are
// none - the old projection's COALESCE(..., '[]'::json) said so, and a caller
// mapping over null is the failure that guarded against.
export type TrackedShipment = ComposedShipment & {
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
  return {
    ...shipment,
    // The three fields the old json_build_object carried, in its order. The
    // event's own id and shipment_id were never part of the response.
    scan_events: events.map((e) => ({
      status: e.status,
      location: e.location,
      scan_time: e.scan_time,
    })),
  };
}

// replaceEvents IS DELETED (wave 3.5). It was the "forget what we had and
// record what the carrier says now" wrapper, and it had ZERO callers: the live
// carrier poll is features/shipping/operations/service.ts, which does the same
// two writes itself behind the guard that stops an unrecognised response from
// emptying a real parcel's history - the bug that deleted five dev shipments'
// FedEx history. Keeping an unguarded second implementation of a write that
// once destroyed data is not caution, it is a loaded gun in a drawer.

export async function removeEvents(
  shipment_id: string, executor?: Executor
): Promise<boolean> {
  const run = async (c: Executor): Promise<boolean> => {
    await legacy.remove(shipment_id, c);
    await tracking.remove(shipment_id, c);
    return true;
  };
  if (executor) await run(executor);
  else await withTransaction(run);
  return true;
}

export async function insertEvents(
  trackingInfo: TrackingInfo | null | undefined,
  shipment_id: string,
  executor?: Executor
): Promise<number> {
  const events: ScanEvent[] = trackingInfo?.scanEvents ?? [];
  if (!events.length) return 0;

  const run = async (c: Executor): Promise<number> => {
    const n = await legacy.insert(events, shipment_id, c);
    await tracking.insert(events, shipment_id, c);
    return n;
  };
  return executor ? await run(executor) : await withTransaction(run);
}
