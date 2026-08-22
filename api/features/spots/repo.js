// Selects which schema the spots feature reads and writes.
// Same three-phase pattern as leads - see api/features/leads/repo.js.
//
//   SPOTS_SOURCE=exchange   (default) read exchange.metals, write it
//   SPOTS_SOURCE=dual                 read the split schemas, write BOTH
//
// There is deliberately no `next`. Writing only to the new schema is the
// one-way door - exchange stops receiving writes and flipping back drops
// everything written in between - and CLAUDE.md says to go through dual and
// stay there. Adding it back should be a deliberate, separate change.
//
// exchange.metals carries both the metal's identity and its live quote. The new
// layout splits them: metals.metals is (id, name), spots.spots is one current
// quote per metal. The wire shape is identical either way.
//
// Gate on `pnpm --filter @dorado/api diff spots` before promoting.
import * as exchange from "#features/spots/repo.exchange.js";
import * as dual from "#features/spots/repo.dual.js";

const SOURCES = { exchange, dual };

const SOURCE = Object.hasOwn(SOURCES, process.env.SPOTS_SOURCE ?? "")
  ? process.env.SPOTS_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const METALS = impl.METALS;
export const getAll = impl.getAll;
export const getAllMetals = impl.getAllMetals;
export const updateQuotes = impl.updateQuotes;
