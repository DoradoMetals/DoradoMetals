// Selects which schema the rates feature reads and writes. Same pattern as
// leads: see api/features/leads/repo.js for the reasoning.
//
//   RATES_SOURCE=exchange   (default) read exchange, write exchange
//   RATES_SOURCE=dual                 read new,      write BOTH
//
// There is deliberately no `next`. Writing only to the new schema is the
// one-way door - exchange stops receiving writes and flipping back drops
// everything written in between - and CLAUDE.md says to go through dual and
// stay there. Adding it back should be a deliberate, separate change.
//
// Gate on `pnpm --filter @dorado/api diff:rates` before flipping.
import * as exchange from "#features/rates/repo.exchange.js";
import * as dual from "#features/rates/repo.dual.js";

const SOURCES = { exchange, dual };

const SOURCE = Object.hasOwn(SOURCES, process.env.RATES_SOURCE ?? "")
  ? process.env.RATES_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const getRate = impl.getRate;
export const getAllRates = impl.getAllRates;
export const getAdminRates = impl.getAdminRates;
export const createRate = impl.createRate;
export const updateRate = impl.updateRate;
export const deleteRate = impl.deleteRate;
