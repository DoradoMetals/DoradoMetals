// Selects which schema the carrier-services feature reads and writes.
// Same three-phase pattern as leads - see api/features/leads/repo.js.
//
//   SERVICES_SOURCE=exchange   (default) read exchange, write exchange
//   SERVICES_SOURCE=dual                 read new,      write BOTH
//
// There is deliberately no `next`. Writing only to the new schema is the
// one-way door, and CLAUDE.md says to go through dual and stay there.
//
// Reading from the new table returns different ids than exchange does, and that
// is by design rather than an accident to be corrected - see repo.dual.js for
// why the id was never the identity here and (carrier_id, name) is.
//
// The practical consequence for whoever promotes this: the admin services table
// will show a different set of uuids after the flip. Nothing stores them, so
// nothing breaks, but a browser holding a stale list would send ids the new
// table does not have, and getById would return null until the page refetches.
import * as exchange from "#features/shipping/services/repo.exchange.js";
import * as dual from "#features/shipping/services/repo.dual.js";

const SOURCES = { exchange, dual };

const SOURCE = Object.hasOwn(SOURCES, process.env.SERVICES_SOURCE ?? "")
  ? process.env.SERVICES_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const getAll = impl.getAll;
export const getById = impl.getById;
export const getByCarrierId = impl.getByCarrierId;
export const create = impl.create;
export const update = impl.update;
export const remove = impl.remove;
