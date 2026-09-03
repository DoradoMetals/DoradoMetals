// products.bullion, and nothing else.
//
// No joins. The implementation this replaces joined metals.metals,
// products.mints and refiners.exchange_compat on every read to attach three
// label strings; compose.ts does that from one read of each reference table
// instead. Four metals, ten mints and two refiners - a join per query bought
// nothing.
//
// NO PLAIN getOne()/list(). Every consumer of this table needs a distinct
// projection or filter - the public storefront row is not the admin row, and
// storefront/sell/homepage/slug/filtered/ids are five different WHERE clauses
// over the public shape. Collapsing them into one getOne/list would move that
// filtering into the service as JS predicates over the whole table, which is
// worse than five small statements. What DID collapse is the write side:
// create() and update() each take one named object instead of positional
// scalars or per-column wrappers, and update() is the one UPDATE statement.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { products } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

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

// The columns sql/update.sql writes, named rather than positional - the admin
// form sends the whole product back (see saveProduct in the service), so this
// is a full replace and not a sparse patch: an absent field binds as NULL
// through the driver exactly as it did when this was a positional tuple.
// metal_id, mint_id and supplier_id are IDS - the service resolves the names
// the admin form sends before this is called; that resolution is the one
// genuine transformation, everything else here is the request body's own
// field, unchanged. updated_by is NOT a field of this type and no longer has
// an `actor` parameter either: public.audit_stamp writes it, and updated_at,
// from the actor on the connection (migration 116).
// undefined is admitted alongside null on every optional column: the admin
// body types each as `?: T | null` (whatever the form did not send is
// undefined, whatever it explicitly cleared is null), and the driver binds
// both the same way, so the type says what is really passed rather than
// forcing a conversion that has no runtime effect.
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
  sell_display: boolean;
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

// What create.sql needs beyond a name - the six columns exchange defaults and
// products.bullion does not (see the SQL's header). `created_by` used to be
// here and is not: the trigger writes it.
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

// The columns update() may write. Every key of ProductPatch and nothing else -
// updated_by and updated_at are absent because they are the trigger's, and
// shared/db/patch.ts refuses either if one is ever added back.
export const PATCHABLE = [
  "metal_id", "supplier_id", "mint_id", "name", "description",
  "bid_premium", "ask_premium", "type", "display", "content", "gross",
  "purity", "variant_group", "shadow_offset", "stock", "slug",
  "homepage_display", "legal_tender", "domestic_tender", "sell_display",
  "is_generic", "variant_label", "quantity", "image_front", "image_back",
  "filter_category",
] as const;

// STILL A FULL REPLACE, which is why every column is named here rather than
// handed to the builder as the caller's object. shared/db/patch.ts treats an
// `undefined` value as a column the caller did not mention - the right default
// for a PATCH, and the opposite of what this statement has always done: the
// admin form sends the whole product back and a field it omits is CLEARED,
// exactly as `undefined` bound as NULL through the driver when this was a
// positional tuple. Spelling the 26 columns with `?? null` keeps that.
export async function update(
  id: string, patch: ProductPatch, executor?: Executor
): Promise<boolean> {
  const full = Object.fromEntries(
    PATCHABLE.map((c) => [c, (patch as Record<string, unknown>)[c] ?? null])
  );
  const built = buildUpdate({
    table: "products.bullion",
    allowed: PATCHABLE,
    patch: full,
    where: { id },
    returning: "id",
  });
  if (!built) return false;
  const r = await query(built.text, built.values, executor);
  return r.rowCount === 1;
}
