// Selects which schema the shipping tracking feature reads from.
//
//   SHIPPING_TRACKING_SOURCE=exchange   (default) read exchange
//   SHIPPING_TRACKING_SOURCE=next                 read the shipping schema
//
// Reads only. Writes still go to exchange, because the write path has not been
// split - so there is no `dual` state yet, and naming one before writes go to
// both places would promise something the code does not do.
//
// The new implementation reconstructs the order link by joining through
// fulfillments, which is why fulfillments had to be backfilled first.
//
// Gate on `pnpm --filter @dorado/api diff shipping-tracking` before promoting.
import * as exchange from "#features/shipping/tracking/repo.exchange.js";
import * as next from "#features/shipping/tracking/repo.next.js";

const SOURCES = { exchange, next };

const SOURCE = Object.hasOwn(SOURCES, process.env.SHIPPING_TRACKING_SOURCE ?? "")
  ? process.env.SHIPPING_TRACKING_SOURCE
  : "exchange";

const reads = SOURCES[SOURCE];

export const activeSource = SOURCE;

// Reads - switchable.
export const getEvents = reads.getEvents;

// Writes - exchange only, until the write path is split.
export const removeEvents = exchange.removeEvents;
export const insertEvents = exchange.insertEvents;
