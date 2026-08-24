// Selects which schema the refiners feature reads.
//
//   REFINERS_SOURCE=exchange   (default) read exchange.suppliers
//   REFINERS_SOURCE=next                 read refiners + organizations
//
// There is no dual phase because there is nothing to dual-write: the feature is
// read-only. Refiners are created and edited outside the API - no route in the
// repo writes to them - so exchange.suppliers cannot drift from the new tables
// through anything this code does. If a write path is ever added, it needs the
// three-phase treatment the other features have.
//
// exchange calls them suppliers and the new schema calls them refiners, which
// is what the business calls them - the module took the new name and the route
// kept the old one, because the frontend calls /api/suppliers/get_all.
//
// A refiner is two rows in the new layout: an organization of type REFINER
// holding the contact details, and a refiners row holding the logo and carrying
// the original supplier id. products.supplier_id points at that id, so nothing
// referencing a supplier changes.
//
// Gate on `pnpm --filter @dorado/api diff refiners` before promoting.
import * as exchange from "#features/refiners/repo.exchange.js";
import * as next from "#features/refiners/repo.next.js";

const SOURCES = { exchange, next };

const SOURCE = Object.hasOwn(SOURCES, process.env.REFINERS_SOURCE ?? "")
  ? process.env.REFINERS_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const getAllRefiners = impl.getAllRefiners;
export const getRefinerFromId = impl.getRefinerFromId;
