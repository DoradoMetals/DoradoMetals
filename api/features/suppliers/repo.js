// Selects which schema the suppliers feature reads.
//
//   SUPPLIERS_SOURCE=exchange   (default) read exchange.suppliers
//   SUPPLIERS_SOURCE=next                 read refiners + organizations
//
// There is no dual phase because there is nothing to dual-write: the feature is
// read-only. Suppliers are created and edited outside the API - no route in the
// repo writes to them - so exchange.suppliers cannot drift from the new tables
// through anything this code does. If a write path is ever added, it needs the
// three-phase treatment the other features have.
//
// A supplier is two rows in the new layout: an organization of type REFINER
// holding the contact details, and a refiners row holding the logo and carrying
// the original supplier id. products.supplier_id points at that id, so nothing
// referencing a supplier changes.
//
// Gate on `pnpm --filter @dorado/api diff suppliers` before promoting.
import * as exchange from "#features/suppliers/repo.exchange.js";
import * as next from "#features/suppliers/repo.next.js";

const SOURCES = { exchange, next };

const SOURCE = Object.hasOwn(SOURCES, process.env.SUPPLIERS_SOURCE ?? "")
  ? process.env.SUPPLIERS_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const getAllSuppliers = impl.getAllSuppliers;
export const getSupplierFromId = impl.getSupplierFromId;
