// Selects which schema the shipping shipments feature reads from.
//
//   SHIPPING_SHIPMENTS_SOURCE=exchange   (default) read exchange
//   SHIPPING_SHIPMENTS_SOURCE=next                 read the shipping schema
//
// Reads only. Writes still go to exchange, because the write path has not been
// split - so there is no `dual` state yet, and naming one before writes go to
// both places would promise something the code does not do.
//
// The new implementation reconstructs the order link by joining through
// fulfillments, which is why fulfillments had to be backfilled first.
//
// Gate on `pnpm --filter @dorado/api diff shipping-shipments` before promoting.
import * as exchange from "#features/shipping/shipments/repo.exchange.js";
import * as next from "#features/shipping/shipments/repo.next.js";

const SOURCES = { exchange, next };

const SOURCE = Object.hasOwn(SOURCES, process.env.SHIPPING_SHIPMENTS_SOURCE ?? "")
  ? process.env.SHIPPING_SHIPMENTS_SOURCE
  : "exchange";

const reads = SOURCES[SOURCE];

export const activeSource = SOURCE;

// Reads - switchable.
export const getAll = reads.getAll;
export const getById = reads.getById;
export const getByOrder = reads.getByOrder;

// Writes - exchange only, until the write path is split.
export const create = exchange.create;
export const update = exchange.update;
export const remove = exchange.remove;
