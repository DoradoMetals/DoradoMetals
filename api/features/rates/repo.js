// Selects which schema the rates feature reads and writes. Same pattern as
// leads: see api/features/leads/repo.js for the reasoning.
//
//   RATES_SOURCE=exchange   (default) read exchange, write exchange
//   RATES_SOURCE=dual                 read new,      write BOTH
//   RATES_SOURCE=next                 read new,      write new
//
// Gate on `pnpm --filter @dorado/api diff:rates` before flipping.
import * as exchange from "#features/rates/repo.exchange.js";
import * as next from "#features/rates/repo.next.js";
import * as dual from "#features/rates/repo.dual.js";

const SOURCES = { exchange, dual, next };

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
