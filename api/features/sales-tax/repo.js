// Selects which schema the sales-tax feature reads and writes.
// Same three-phase pattern as leads - see api/features/leads/repo.js.
//
//   SALES_TAX_SOURCE=exchange   (default) read exchange, write exchange
//   SALES_TAX_SOURCE=dual                 read new,      write BOTH
//
// There is deliberately no `next`. Writing only to the new schema is the
// one-way door - exchange stops receiving writes and flipping back drops
// everything written in between - and CLAUDE.md says to go through dual and
// stay there. Adding it back should be a deliberate, separate change.
// The target schema here is `tax`. `dual` reads it and writes both.
//
// Gate on `pnpm --filter @dorado/api diff sales-tax` before promoting.
import * as exchange from "#features/sales-tax/repo.exchange.js";
import * as dual from "#features/sales-tax/repo.dual.js";

// An unrecognised value is NOT an error: the Object.hasOwn check below falls
// back to `exchange`, silently. So a setting listed here that SOURCES does not
// contain reads as a working promotion and is not one.
const SOURCES = { exchange, dual };

const SOURCE = Object.hasOwn(SOURCES, process.env.SALES_TAX_SOURCE ?? "")
  ? process.env.SALES_TAX_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const getSalesTax = impl.getSalesTax;
export const updateStateSalesTax = impl.updateStateSalesTax;
export const isNexus = impl.isNexus;
