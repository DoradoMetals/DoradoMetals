// Tracking: the scan events of one shipment. Events are REPLACED WHOLESALE,
// not edited - a carrier poll removes what is there and inserts the current
// set, in one transaction.
//
// There is no getEvents here any more. The scans were only ever read to be
// turned into a progress timeline, and that derivation is
// domain/shipping/rules.ts trackingTimeline, composed into the ShipmentView -
// so a caller asks for the parcel and gets its progress with it.
import * as tracking from "#db/shipping/tracking/repo.ts";
import type { ScanEvent, TrackingInfo } from "#db/shipping/tracking/repo.ts";
import type { Executor } from "#shared/db/executor.ts";

export type { ScanEvent, TrackingInfo } from "#db/shipping/tracking/repo.ts";

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
