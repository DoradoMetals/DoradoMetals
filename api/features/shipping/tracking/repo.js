// Selects which schema the shipping tracking feature reads from.
//
//   SHIPPING_TRACKING_SOURCE=exchange   (default) read exchange, write exchange
//   SHIPPING_TRACKING_SOURCE=dual                 read the shipping schema, write BOTH
//
// `dual` means what it says: every write goes to exchange and is then mirrored
// into the shipping schema inside the same transaction, so both hold the same
// rows and falling back loses nothing.
//
// There is deliberately no `next`. Writing only to the new schema is the
// one-way door, and CLAUDE.md says to go through dual and stay there.
//
// The new implementation reconstructs the order link by joining through
// fulfillments, which is why fulfillments had to be backfilled first.
//
// Gate on `pnpm --filter @dorado/api diff shipping-tracking` before promoting.
import * as exchange from "#features/shipping/tracking/repo.exchange.js";
import * as dual from "#features/shipping/tracking/repo.dual.js";

const SOURCES = { exchange, dual };

const SOURCE = Object.hasOwn(SOURCES, process.env.SHIPPING_TRACKING_SOURCE ?? "")
  ? process.env.SHIPPING_TRACKING_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const getEvents = impl.getEvents;

export const removeEvents = impl.removeEvents;
export const insertEvents = impl.insertEvents;
