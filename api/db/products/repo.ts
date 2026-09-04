// products.bullion, and nothing else.
//
// ONE public statement and ONE admin statement. There were eight, six of them
// the same projection under a different WHERE; the WHERE is now a filter this
// file builds from a closed set of keys, and the metal, mint and supplier
// names are JOINED rather than attached by a composer afterwards.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import {
  BullionPatch,
  BullionPatchColumns,
  type BullionAdmin,
  type BullionFilter,
  type BullionLiveness,
  type BullionSort,
  type BullionStorefront,
} from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

// Derived from the contract, never restated (ruling 64): a column becomes
// writable by being named in BullionPatch and nowhere else.
export const PATCHABLE = Object.keys(BullionPatchColumns.shape) as (keyof BullionPatchColumns)[];

// EVERY QUESTION THE CATALOGUE IS ASKED - BullionFilter, from the contract.
// Absent means "do not filter"; the buy-side gate is `display: true` and the
// sell side simply omits it (ruling 49).
//
// Closed set, keyed by a name the transport parses against it - no caller
// string ever reaches the statement.
const ORDERINGS: Record<BullionSort, string> = {
  name: "b.name ASC, b.id ASC",
  content: "b.content DESC, b.name ASC, b.id ASC",
  newest: "b.created_at DESC, b.id DESC",
};

// The predicate, built from the keys the filter carries. Only placeholder
// numbers are interpolated; every value is bound.
function where(f: BullionFilter): { text: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const bind = (value: unknown) => `$${values.push(value)}`;

  if (f.ids) conditions.push(`b.id = ANY(${bind(f.ids)}::uuid[])`);
  if (f.slug !== undefined) conditions.push(`b.slug = ${bind(f.slug)}`);
  if (f.display !== undefined) conditions.push(`b.display = ${bind(f.display)}`);
  if (f.homepage_display !== undefined) {
    conditions.push(`b.homepage_display = ${bind(f.homepage_display)}`);
  }
  // The metal arrives as a NAME - it is joined, so there is no id to resolve.
  if (f.metal !== undefined) conditions.push(`m.name = ${bind(f.metal)}`);
  if (f.filter_category !== undefined) {
    conditions.push(`b.filter_category = ${bind(f.filter_category)}`);
  }
  if (f.type !== undefined) conditions.push(`b.type = ${bind(f.type)}`);
  if (f.is_generic !== undefined) conditions.push(`b.is_generic = ${bind(f.is_generic)}`);
  // The search box, server-side. A term matches the product, its variant, its
  // shape or its metal - which is what the browser's fuzzy match was reading.
  if (f.search) {
    const term = bind(`%${f.search.trim()}%`);
    conditions.push(
      `(b.name ILIKE ${term} OR b.variant_label ILIKE ${term} ` +
      `OR b.type ILIKE ${term} OR m.name ILIKE ${term})`
    );
  }

  return { text: conditions.length ? conditions.join(" AND ") : "true", values };
}

// replaceAll, not replace - a comment naming a token verbatim would itself be
// the first match and get substituted (this happened).
const build = (name: string, predicate: string, ordering?: string): string => {
  const text = sql(name).replaceAll("__PREDICATE__", predicate);
  return ordering === undefined ? text : text.replaceAll("__ORDERING__", ordering);
};

export async function listFor(
  filter: BullionFilter = {}, executor?: Executor
): Promise<BullionStorefront[]> {
  // An explicitly empty id list asks for nothing, and `= ANY('{}')` is a scan
  // that answers nothing - so it is answered here instead.
  if (filter.ids?.length === 0) return [];
  const { text, values } = where(filter);
  const { rows } = await query<BullionStorefront>(
    build("list", text, ORDERINGS[filter.sort ?? "name"]), values, executor
  );
  return rows;
}

export async function listAdmin(
  filter: BullionFilter = {}, executor?: Executor
): Promise<BullionAdmin[]> {
  const { text, values } = where(filter);
  const { rows } = await query<BullionAdmin>(build("get_admin", text), values, executor);
  return rows;
}

export async function getOne(id: string, executor?: Executor): Promise<BullionAdmin | undefined> {
  const rows = await listAdmin({ ids: [id] }, executor);
  return rows[0];
}

export async function getLiveness(
  ids: string[], executor?: Executor
): Promise<BullionLiveness[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<BullionLiveness>(sql("get_liveness"), [ids], executor);
  return rows;
}

// The distinct shapes, for the admin dropdown. A bare list of names
// (ruling 12), not rows.
export async function listTypes(executor?: Executor): Promise<string[]> {
  const { rows } = await query<{ type: string }>(sql("get_types"), [], executor);
  return rows.map((row) => row.type);
}

export async function create(patch: BullionPatch, executor?: Executor): Promise<string> {
  const { rows } = await query<{ id: string }>(
    sql("create"),
    [patch.id ?? null, patch.name, patch.metal_id, patch.mint_id, patch.supplier_id,
     patch.image_front, patch.image_back, patch.stock, patch.quantity],
    executor
  );
  return rows[0].id;
}

export async function update(
  id: string, patch: BullionPatchColumns, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "products.bullion", allowed: PATCHABLE, patch, where: { id }, returning: "id",
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}
