// Selects which schema the mints feature reads.
//
// Mints are read-only through the API - there is no create, update or delete
// path - so this is a two-state switch rather than the three-phase
// exchange/dual/next used where writes have to be mirrored. With no writes
// there is nothing to keep in sync and nothing to lose by switching back.
//
//   MINTS_SOURCE=exchange   (default) read exchange.mints
//   MINTS_SOURCE=next                 read products.mints + organizations
//
// Note that carts/repo.js and products/repo.exchange.js still join
// exchange.mints directly; they move with their own features.
//
// Gate on `pnpm --filter @dorado/api diff mints` before promoting.
import * as exchange from "#features/mints/repo.exchange.js";
import * as next from "#features/mints/repo.next.js";

const SOURCES = { exchange, next };

const SOURCE = Object.hasOwn(SOURCES, process.env.MINTS_SOURCE ?? "")
  ? process.env.MINTS_SOURCE
  : "exchange";

export const activeSource = SOURCE;

export const getAllMints = SOURCES[SOURCE].getAllMints;
