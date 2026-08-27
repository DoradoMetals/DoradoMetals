// A product and the three names that describe it, joined in memory.
//
// The implementation this replaces did it in SQL, on every read:
//
//     JOIN metals.metals   metal    ON metal.id    = product.metal_id
//     JOIN products.mints  mint     ON mint.id     = product.mint_id
//     JOIN refiners.exchange_compat supplier ON supplier.id = p.supplier_id
//
// Three joins to fetch three strings out of tables holding four, ten and two
// rows. Here each reference table is read once and the labels attached.
//
// THE JOINS WERE INNER, SO A PRODUCT WITH AN UNKNOWN METAL OR MINT WAS DROPPED,
// and it is dropped here too. That is preserved rather than improved on: the
// storefront row declares `metal_type` and `mint_name`, and a product composed
// with nulls in them would render a nameless entry in the shop instead of not
// rendering at all. All three columns are NOT NULL with foreign keys, so this
// only fires if a reference row is deleted underneath a product.
import * as metals from "#features/metals/repo.ts";
import * as mints from "#features/mints/repo.ts";
import * as refiners from "#features/refiners/service.ts";
import type { PublicProductRow, AdminProductRow } from "#features/products/repo.ts";

// What the storefront returns: the public columns, minus the two ids, plus the
// two labels. Derived from the row type rather than restated, so a column added
// to the projection cannot quietly stop being returned.
export type StorefrontProduct = Omit<PublicProductRow, "metal_id" | "mint_id"> & {
  metal_type: string;
  mint_name: string;
};

// What the admin table returns: the admin columns, minus the three ids, plus
// the three names. `metal`, `supplier` and `mint` are what the old projection
// aliased them to; the admin form sends those names straight back.
export type AdminProduct = Omit<
  AdminProductRow, "metal_id" | "mint_id" | "supplier_id"
> & {
  metal: string;
  supplier: string;
  mint: string;
};

// One read of each reference table, shared by every composition in a request.
//
// The fields are `metalNames` and not `metals` on purpose. `l.metals.get(id)`
// is a Map lookup, but it reads exactly like a call on the `metals` namespace
// imported above - and lint:namespace-calls said so, reporting
// `metals.get() not exported by #features/metals/repo.ts`. The linter was
// right that the two are indistinguishable; a reader has the same problem.
export type Labels = {
  metalNames: Map<string, string>;
  mintNames: Map<string, string>;
  refinerNames: Map<string, string>;
};

export async function labels(): Promise<Labels> {
  const [metalRows, mintRows, refinerRows] = await Promise.all([
    metals.getAll(),
    mints.getAll(),
    // A refiner's name lives on its ORGANIZATION, not on refiners.refiners, so
    // this goes through the service that composes the two rather than reading a
    // table that does not have the column.
    refiners.getAllRefiners(),
  ]);
  return {
    metalNames: new Map(metalRows.map((m) => [m.id, m.name])),
    mintNames: new Map(mintRows.map((m) => [m.id, m.name])),
    refinerNames: new Map(
      refinerRows.flatMap((r) => (r.organization.name ? [[r.id, r.organization.name] as const] : []))
    ),
  };
}

export function storefront(rows: PublicProductRow[], l: Labels): StorefrontProduct[] {
  return rows.flatMap((row) => {
    const { metal_id, mint_id, ...rest } = row;
    const metal_type = metal_id === null ? undefined : l.metalNames.get(metal_id);
    const mint_name = mint_id === null ? undefined : l.mintNames.get(mint_id);
    if (metal_type === undefined || mint_name === undefined) return [];
    return [{ ...rest, metal_type, mint_name }];
  });
}

export function admin(rows: AdminProductRow[], l: Labels): AdminProduct[] {
  return rows.flatMap((row) => {
    const { metal_id, mint_id, supplier_id, ...rest } = row;
    const metal = metal_id === null ? undefined : l.metalNames.get(metal_id);
    const mint = mint_id === null ? undefined : l.mintNames.get(mint_id);
    const supplier = supplier_id === null ? undefined : l.refinerNames.get(supplier_id);
    if (metal === undefined || mint === undefined || supplier === undefined) return [];
    return [{ ...rest, metal, supplier, mint }];
  });
}
