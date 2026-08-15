// Selects which schema the rates feature reads and writes. Same pattern as
// leads: see api/features/leads/repo.js for the reasoning.
//
//   RATES_SOURCE=exchange   (default) reads and writes exchange.rates
//   RATES_SOURCE=core                 reads and writes core.rates
//
// Gate on `pnpm --filter @dorado/api diff:rates` before flipping.
import * as exchange from "#features/rates/repo.exchange.js";
import * as core from "#features/rates/repo.core.js";

const SOURCE = process.env.RATES_SOURCE === "core" ? "core" : "exchange";
const impl = SOURCE === "core" ? core : exchange;

export const activeSource = SOURCE;

export const getRate = impl.getRate;
export const getAllRates = impl.getAllRates;
export const getAdminRates = impl.getAdminRates;
export const createRate = impl.createRate;
export const updateRate = impl.updateRate;
export const deleteRate = impl.deleteRate;
