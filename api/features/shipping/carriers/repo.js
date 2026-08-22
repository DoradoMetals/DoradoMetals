// Selects which schema the carriers feature reads and writes.
// Same three-phase pattern as leads - see api/features/leads/repo.js.
//
//   CARRIERS_SOURCE=exchange   (default) read exchange, write exchange
//   CARRIERS_SOURCE=dual                 read new,      write BOTH
//   CARRIERS_SOURCE=next                 read new,      write new
//
// A carrier is two rows in the new layout: an organization of type CARRIER with
// the name and contact details, and a shipping.carriers row with the logo,
// carrying the original carrier id.
//
// That id has to survive: FEDEX_CARRIER_ID in providers/fedex/constants.js is a
// literal uuid and exchange.shipments.carrier_id references it, so a carrier
// that changed id would break label creation.
//
// Gate on `pnpm --filter @dorado/api diff carriers` before promoting.
import * as exchange from "#features/shipping/carriers/repo.exchange.js";
import * as next from "#features/shipping/carriers/repo.next.js";
import * as dual from "#features/shipping/carriers/repo.dual.js";

const SOURCES = { exchange, dual, next };

const SOURCE = Object.hasOwn(SOURCES, process.env.CARRIERS_SOURCE ?? "")
  ? process.env.CARRIERS_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const getAll = impl.getAll;
export const getById = impl.getById;
export const getNameById = impl.getNameById;
export const create = impl.create;
export const update = impl.update;
export const remove = impl.remove;
