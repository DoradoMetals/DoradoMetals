// A product and the three names that describe it, joined in memory — one read of each reference table (four metals, ten mints, two refiners) instead of a join per query.
// Inner-join semantics preserved deliberately: a product with an unknown metal/mint/supplier is dropped rather than rendered with a blank name. All three are NOT NULL FKs, so this only fires if a reference row is deleted underneath a product.
import * as metals from "#db/metals/repo.ts";
import * as mints from "#db/mints/repo.ts";
import * as refiners from "#domain/refiners/service.ts";
import type { PublicProductRow, AdminProductRow } from "#db/products/repo.ts";

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
// Named `metalNames`, not `metals`: `l.metals.get(id)` would read exactly like a call on the `metals` namespace imported above, and lint:namespace-calls flagged it as such — the two really are indistinguishable.
export type Labels = {
  metalNames: Map<string, string>;
  mintNames: Map<string, string>;
  refinerNames: Map<string, string>;
};

// Sequential, not Promise.all: every caller of this reaches it with no
// executor of its own, so all three calls default to the shared pool - which
// looks safe (a real, unpinned pool hands out a separate connection per
// call), but a request running inside a transaction (an HTTP test, or any
// caller that later starts passing its own client through) pins the pool to
// ONE client for its whole lifetime, and three concurrent queries on that one
// client is the same "already executing" bug detailsFor() had. Three
// different reference tables, so there is no one query to merge them into.
export async function labels(): Promise<Labels> {
  const metalRows = await metals.list();
  const mintRows = await mints.list();
  // A refiner's name lives on its ORGANIZATION, not refiners.refiners, so this goes through the composing service rather than a table without the column.
  const refinerRows = await refiners.getAllRefiners();
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
    const metal_type = row.metal_id === null ? undefined : l.metalNames.get(row.metal_id);
    const mint_name = row.mint_id === null ? undefined : l.mintNames.get(row.mint_id);
    if (metal_type === undefined || mint_name === undefined) return [];
    return [{
      id: row.id,
      name: row.name,
      description: row.description,
      content: row.content,
      purity: row.purity,
      gross: row.gross,
      bid_premium: row.bid_premium,
      ask_premium: row.ask_premium,
      type: row.type,
      image_front: row.image_front,
      image_back: row.image_back,
      variant_group: row.variant_group,
      shadow_offset: row.shadow_offset,
      slug: row.slug,
      legal_tender: row.legal_tender,
      domestic_tender: row.domestic_tender,
      is_generic: row.is_generic,
      variant_label: row.variant_label,
      metal_type,
      mint_name,
    }];
  });
}

export function admin(rows: AdminProductRow[], l: Labels): AdminProduct[] {
  return rows.flatMap((row) => {
    const metal = row.metal_id === null ? undefined : l.metalNames.get(row.metal_id);
    const mint = row.mint_id === null ? undefined : l.mintNames.get(row.mint_id);
    const supplier = row.supplier_id === null ? undefined : l.refinerNames.get(row.supplier_id);
    if (metal === undefined || mint === undefined || supplier === undefined) return [];
    return [{
      id: row.id,
      name: row.name,
      description: row.description,
      bid_premium: row.bid_premium,
      ask_premium: row.ask_premium,
      type: row.type,
      created_at: row.created_at,
      updated_at: row.updated_at,
      image_front: row.image_front,
      image_back: row.image_back,
      display: row.display,
      content: row.content,
      gross: row.gross,
      purity: row.purity,
      variant_group: row.variant_group,
      shadow_offset: row.shadow_offset,
      stock: row.stock,
      created_by: row.created_by,
      updated_by: row.updated_by,
      homepage_display: row.homepage_display,
      filter_category: row.filter_category,
      quantity: row.quantity,
      slug: row.slug,
      legal_tender: row.legal_tender,
      domestic_tender: row.domestic_tender,
      is_generic: row.is_generic,
      variant_label: row.variant_label,
      metal,
      supplier,
      mint,
    }];
  });
}
