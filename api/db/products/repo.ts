// products.bullion, and nothing else — no joins (compose.ts attaches metal/mint/refiner labels from one read of each instead); five distinct WHERE clauses (storefront/sell/homepage/slug/filtered/ids) rather than one getOne/list, because each consumer's shape genuinely differs.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { products } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// The public row: what any visitor may see, plus the two ids compose.ts turns
// into labels and then drops.
export type PublicProductRow = Pick<
  products.bullion.Row,
  | "id" | "name" | "description" | "content" | "purity" | "gross"
  | "bid_premium" | "ask_premium" | "type" | "image_front" | "image_back"
  | "variant_group" | "shadow_offset" | "slug" | "legal_tender"
  | "domestic_tender" | "is_generic" | "variant_label"
  | "metal_id" | "mint_id"
>;

// The admin row: everything above plus what only an admin sees, and the third
// id - a supplier is not a public fact about a product.
export type AdminProductRow = Pick<
  products.bullion.Row,
  | "id" | "name" | "description" | "bid_premium" | "ask_premium" | "type"
  | "created_at" | "updated_at" | "image_front" | "image_back" | "display"
  | "content" | "gross" | "purity" | "variant_group" | "shadow_offset"
  | "stock" | "created_by" | "updated_by" | "homepage_display"
  | "filter_category" | "quantity" | "slug" | "legal_tender"
  | "domestic_tender" | "is_generic" | "variant_label"
  | "metal_id" | "mint_id" | "supplier_id"
>;

export type Liveness = Pick<products.bullion.Row, "id" | "display">;

// Full replace, not a sparse patch: an absent field binds NULL, exactly as when this was a positional tuple.
// metal_id/mint_id/supplier_id are ids already resolved by the service; updated_by/updated_at are the trigger's (migration 116), not this type's.
export type ProductPatch = {
  metal_id: string;
  supplier_id: string;
  mint_id: string;
  name?: string | null;
  description?: string | null;
  bid_premium?: number | null;
  ask_premium?: number | null;
  type?: string | null;
  display: boolean;
  content?: number | null;
  gross?: number | null;
  variant_group?: string | null;
  shadow_offset?: number | null;
  purity?: number | null;
  stock?: number | null;
  slug?: string | null;
  homepage_display: boolean;
  legal_tender: boolean;
  domestic_tender: boolean;
  is_generic: boolean;
  variant_label?: string | null;
  quantity?: number | null;
  image_front?: string | null;
  image_back?: string | null;
  filter_category?: string | null;
};

export async function getStorefront(executor?: Executor): Promise<PublicProductRow[]> {
  const { rows } = await query<PublicProductRow>(sql("get_storefront"), [], executor);
  return rows;
}

export async function getSell(executor?: Executor): Promise<PublicProductRow[]> {
  const { rows } = await query<PublicProductRow>(sql("get_sell"), [], executor);
  return rows;
}

export async function getHomepage(executor?: Executor): Promise<PublicProductRow[]> {
  const { rows } = await query<PublicProductRow>(sql("get_homepage"), [], executor);
  return rows;
}

// Returns a LIST, not one row — a slug is shared across a product's variants (gold-american-eagle is four rows by variant_label), so there is deliberately no unique index on slug. The controller 404s only on an empty list.
export async function getBySlug(slug: string, executor?: Executor): Promise<PublicProductRow[]> {
  const { rows } = await query<PublicProductRow>(sql("get_by_slug"), [slug], executor);
  return rows;
}

export async function getByIds(ids: string[], executor?: Executor): Promise<PublicProductRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<PublicProductRow>(sql("get_by_ids"), [ids], executor);
  return rows;
}

// Optional filters, combined — absent means "do not filter" (a null metal_id would filter for productless-metal rows, and every product has one).
// Takes metal_id, not the metal's name; see sql/get_filtered.sql.
type ProductFilterIds = {
  metal_id?: string;
  filter_category?: string;
  product_type?: string;
};

export async function getFiltered(
  { metal_id, filter_category, product_type }: ProductFilterIds = {},
  executor?: Executor
): Promise<PublicProductRow[]> {
  const conditions = ["display = true"];
  const values: string[] = [];

  if (metal_id) {
    values.push(metal_id);
    conditions.push(`metal_id = $${values.length}`);
  }
  if (filter_category) {
    values.push(filter_category);
    conditions.push(`filter_category = $${values.length}`);
  }
  if (product_type) {
    values.push(product_type);
    conditions.push(`type = $${values.length}`);
  }

  // replaceAll, not replace — the token appears once, but a comment naming it verbatim would itself be the first match and get substituted (this happened).
  // Only placeholder numbers reach the statement; every value is bound.
  const { rows } = await query<PublicProductRow>(
    sql("get_filtered").replaceAll("__PREDICATE__", conditions.join(" AND ")),
    values,
    executor
  );
  return rows;
}

export async function getAdminAll(executor?: Executor): Promise<AdminProductRow[]> {
  const { rows } = await query<AdminProductRow>(sql("get_admin_all"), [], executor);
  return rows;
}

export async function getAdminOne(
  id: string, executor?: Executor
): Promise<AdminProductRow | undefined> {
  const { rows } = await query<AdminProductRow>(sql("get_admin_one"), [id], executor);
  return rows[0];
}

export async function getLiveness(ids: string[], executor?: Executor): Promise<Liveness[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<Liveness>(sql("get_liveness"), [ids], executor);
  return rows;
}

export async function getTypes(executor?: Executor): Promise<{ name: string }[]> {
  const { rows } = await query<{ name: string }>(sql("get_types"), [], executor);
  return rows;
}

// What create.sql needs beyond a name — the six columns exchange defaulted and products.bullion does not (see the SQL's header). created_by is the trigger's, not this type's.
export type NewProduct = {
  id: string;
  name: string;
  metal_id: string; mint_id: string; supplier_id: string;
  image_front: string; image_back: string; stock: number; quantity: number;
};

export async function create(row: NewProduct, executor?: Executor): Promise<string> {
  const { rows } = await query<{ id: string }>(
    sql("create"),
    [row.id, row.name, row.metal_id, row.mint_id, row.supplier_id,
     row.image_front, row.image_back, row.stock, row.quantity],
    executor
  );
  return rows[0].id;
}

// Every key of ProductPatch and nothing else — updated_by/updated_at stay absent because they're the trigger's; shared/db/patch.ts refuses either if one is added back.
export const PATCHABLE = [
  "metal_id", "supplier_id", "mint_id", "name", "description",
  "bid_premium", "ask_premium", "type", "display", "content", "gross",
  "purity", "variant_group", "shadow_offset", "stock", "slug",
  "homepage_display", "legal_tender", "domestic_tender",
  "is_generic", "variant_label", "quantity", "image_front", "image_back",
  "filter_category",
] as const;

// A full replace in practice: the contract (@dorado/contracts' ProductPatch)
// requires every column, so the caller never omits one - but the write
// itself is the same present-sets/absent-leaves-alone contract as every
// other update() (shared/db/patch.ts).
export async function update(
  id: string, patch: ProductPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "products.bullion", allowed: PATCHABLE, patch, where: { id }, returning: "id",
  });
  if (!built) return true;
  const r = await query(built.text, built.values, executor);
  return r.rowCount === 1;
}
