// Dual-write phase of the tracking migration.
//
// Tracking events are replaced wholesale rather than edited: a carrier poll
// removes what is there and inserts the current set. So the mirror does the
// same, and the two stay in step without needing to match events individually.
import withTransaction from "#shared/db/withTransaction.js";
import * as exchange from "#features/shipping/tracking/repo.exchange.js";
import * as next from "#features/shipping/tracking/repo.next.js";

export const getEvents = next.getEvents;

const both = (executor, fn) => (executor ? fn(executor) : withTransaction(fn));

export const removeEvents = (shipment_id, client) =>
  both(client, async (c) => {
    await exchange.removeEvents(shipment_id, c);
    await next.removeEvents(shipment_id, c);
    return true;
  });

export const insertEvents = (trackingInfo, shipment_id, client) =>
  both(client, async (c) => {
    const n = await exchange.insertEvents(trackingInfo, shipment_id, c);
    await next.insertEvents(trackingInfo, shipment_id, c);
    return n;
  });
