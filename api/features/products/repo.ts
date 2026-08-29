// products.bullion, and nothing else.
//
// No joins. The implementation this replaces joined metals.metals,
// products.mints and refiners.exchange_compat on every read to attach three
// label strings; compose.ts does that from one read of each reference table
// instead. Four metals, ten mints and two refiners - a join per query bought
// nothing.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { products } from "@dorado/contracts";
import type { PoolClient } from "pg";

const sql = sqlFrom(import.meta.dirname);

export type Executor = PoolClient | undefined;

// The public row: what any visitor may see, plus the two ids compose.ts turns
// into labels and then drops.
export type PublicProductRow = Pick<
  products.BullionRow,
  | "id" | "name" | "description" | "content" | "purity" | "gross"
  | "bid_premium" | "ask_premium" | "type" | "image_front" | "image_back"
  | "variant_group" | "shadow_offset" | "slug" | "legal_tender"
  | "domestic_tender" | "sell_display" | "is_generic" | "variant_label"
  | "metal_id" | "mint_id"
>;

// The admin row: everything above plus what only an admin sees, and the third
// id - a supplier is not a public fact about a product.
export type AdminProductRow = Pick<
  products.BullionRow,
  | "id" | "name" | "description" | "bid_premium" | "ask_premium" | "type"
  | "created_at" | "updated_at" | "image_front" | "image_back" | "display"
  | "content" | "gross" | "purity" | "variant_group" | "shadow_offset"
  | "stock" | "created_by" | "updated_by" | "homepage_display"
  | "filter_category" | "quantity" | "slug" | "legal_tender"
  | "domestic_tender" | "sell_display" | "is_generic" | "variant_label"
  | "metal_id" | "mint_id" | "supplier_id"
>;

export type Liveness = Pick<products.BullionRow, "id" | "display" | "sell_display">;

// The values sql/update.sql takes, in its order. The three reference columns
// are IDS: the service resolves the names the admin form sends.
export type ProductValues = [
  string, string, string | null, string | null,
  number | null, number | null, string | null, boolean,
  number | null, number | null, number | null, string,
  string | null, number | null, number | null, string,
  string | null, boolean, boolean, boolean, boolean, boolean,
  string | null, number | null, string | null, string | null, string | null,
];

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

// A LIST, AND THE LIST IS THE POINT. A slug does not identify one product: a
// product with sizes shares one slug across its variants - `gold-american-eagle`
// is four rows, 1/10 oz through 1 oz, differing by variant_label - and the
// product page renders the set. There is no unique index on slug in either
// schema, and that is correct rather than an omission.
//
// The controller returns the whole list and answers 404 only on an empty one.
export async function getBySlug(slug: string, executor?: Executor): Promise<PublicProductRow[]> {
  const { rows } = await query<PublicProductRow>(sql("get_by_slug"), [slug], executor);
  return rows;
}

// A product by NAME. See sql/find_id_by_name.sql - the caller is the quote
// surface, which takes a name off a request body when no id was sent.
export async function findIdByName(
  name: string, executor?: Executor
): Promise<products.BullionRow["id"] | null> {
  const { rows } = await query<Pick<products.BullionRow, "id">>(
    sql("find_id_by_name"), [name], executor
  );
  return rows[0]?.id ?? null;
}

export async function getByIds(ids: string[], executor?: Executor): Promise<PublicProductRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<PublicProductRow>(sql("get_by_ids"), [ids], executor);
  return rows;
}

// The optional filters, combined. Absent means "do not filter", which is why
// each is optional rather than nullable - a null metal_id would be a filter for
// products with no metal, and every product has one.
//
// metal_id rather than the metal's NAME: see the header of sql/get_filtered.sql.
export type ProductFilterIds = {
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

  // replaceAll, not replace. The token appears once in the statement, but a
  // comment that mentioned it by name would be the FIRST occurrence and would
  // have been substituted instead - which is exactly what happened.
  // Only the placeholder NUMBERS reach the statement; every value is bound.
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

// The six values exchange defaults and products.bullion does not - see the
// header of sql/create.sql.
export type ProductDefaults = {
  metal_id: string; mint_id: string; supplier_id: string;
  image_front: string; image_back: string; stock: number; quantity: number;
};

export async function create(
  id: string, name: string, created_by: string, d: ProductDefaults, executor?: Executor
): Promise<string> {
  const { rows } = await query<{ id: string }>(
    sql("create"),
    [id, name, created_by, d.metal_id, d.mint_id, d.supplier_id,
     d.image_front, d.image_back, d.stock, d.quantity],
    executor
  );
  return rows[0].id;
}

export async function update(
  id: string, values: ProductValues, executor?: Executor
): Promise<string | undefined> {
  const { rows } = await query<{ id: string }>(sql("update"), [...values, id], executor);
  return rows[0]?.id;
}
