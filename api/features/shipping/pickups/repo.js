// Selects which schema the carrier-pickups feature reads and writes.
// Same three-phase pattern as leads - see api/features/leads/repo.js.
//
//   PICKUPS_SOURCE=exchange   (default) read exchange, write exchange
//   PICKUPS_SOURCE=dual                 read new,      write BOTH
//
// There is deliberately no `next`. Writing only to the new schema is the
// one-way door, and CLAUDE.md says to go through dual and stay there.
//
// This is the one feature where the exchange side was not working before the
// split: create and update named a column the table does not have, so no
// pickup has ever been recorded. See repo.exchange.js. Both tables are
// therefore empty in dev and production, and the new-schema reads have no rows
// to be checked against - `diff pickups` compares two empty sets and proves
// only that neither throws.
import * as exchange from "#features/shipping/pickups/repo.exchange.js";
import * as dual from "#features/shipping/pickups/repo.dual.js";

const SOURCES = { exchange, dual };

const SOURCE = Object.hasOwn(SOURCES, process.env.PICKUPS_SOURCE ?? "")
  ? process.env.PICKUPS_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const getAll = impl.getAll;
export const getById = impl.getById;
export const getByOrder = impl.getByOrder;
export const create = impl.create;
export const update = impl.update;
export const remove = impl.remove;
