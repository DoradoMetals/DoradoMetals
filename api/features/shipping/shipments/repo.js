// Selects which schema the shipping shipments feature reads from.
//
//   SHIPPING_SHIPMENTS_SOURCE=exchange   (default) read exchange, write exchange
//   SHIPPING_SHIPMENTS_SOURCE=dual                 read the shipping schema, write BOTH
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
// Gate on `pnpm --filter @dorado/api diff shipping-shipments` before promoting.
import * as exchange from "#features/shipping/shipments/repo.exchange.js";
import * as dual from "#features/shipping/shipments/repo.dual.js";

const SOURCES = { exchange, dual };

const SOURCE = Object.hasOwn(SOURCES, process.env.SHIPPING_SHIPMENTS_SOURCE ?? "")
  ? process.env.SHIPPING_SHIPMENTS_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const getAll = impl.getAll;
export const getById = impl.getById;
export const getByOrder = impl.getByOrder;

export const create = impl.create;
export const update = impl.update;
export const remove = impl.remove;
