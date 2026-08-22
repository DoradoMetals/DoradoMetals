// Selects which schema the sales-tax feature reads and writes.
// Same three-phase pattern as leads - see api/features/leads/repo.js.
//
//   SALES_TAX_SOURCE=exchange   (default) read exchange, write exchange
//   SALES_TAX_SOURCE=dual                 read new,      write BOTH
//   SALES_TAX_SOURCE=core                 read new,      write new
//
// The target schema here is `tax`, not `core`. The token means "the new
// schema" and is kept identical across features so the switch reads the same
// everywhere.
//
// Gate on `pnpm --filter @dorado/api diff sales-tax` before promoting.
import * as exchange from "#features/sales-tax/repo.exchange.js";
import * as core from "#features/sales-tax/repo.core.js";
import * as dual from "#features/sales-tax/repo.dual.js";

const SOURCES = { exchange, dual, core };

const SOURCE = Object.hasOwn(SOURCES, process.env.SALES_TAX_SOURCE ?? "")
  ? process.env.SALES_TAX_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const getSalesTax = impl.getSalesTax;
export const updateStateSalesTax = impl.updateStateSalesTax;
export const isNexus = impl.isNexus;
