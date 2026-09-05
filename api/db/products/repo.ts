import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import {
  BullionCreate,
  BullionPatchColumns,
  type BullionAdmin,
  type BullionFilter,
  type BullionLiveness,
  type BullionSort,
  BullionStorefront as Storefront,
  type BullionStorefront,
} from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

export const PATCHABLE = Object.keys(BullionPatchColumns.shape) as (keyof BullionPatchColumns)[];

const ORDERINGS: Record<BullionSort, string> = {
  name: "b.name ASC, b.id ASC",
  content: "b.content DESC, b.name ASC, b.id ASC",
  newest: "b.created_at DESC, b.id DESC",
};

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
  if (f.metal_id !== undefined) conditions.push(`b.metal_id = ${bind(f.metal_id)}`);
  if (f.filter_category !== undefined) {
    conditions.push(`b.filter_category = ${bind(f.filter_category)}`);
  }
  if (f.type !== undefined) conditions.push(`b.type = ${bind(f.type)}`);
  if (f.is_generic !== undefined) conditions.push(`b.is_generic = ${bind(f.is_generic)}`);
  if (f.search) {
    const term = bind(`%${f.search.trim()}%`);
    conditions.push(
      `(b.name ILIKE ${term} OR b.variant_label ILIKE ${term} ` +
      `OR b.type ILIKE ${term} OR b.metal_id ILIKE ${term})`
    );
  }

  return { text: conditions.length ? conditions.join(" AND ") : "true", values };
}

const build = (name: string, predicate: string, ordering?: string): string => {
  const text = sql(name).replaceAll("__PREDICATE__", predicate);
  return ordering === undefined ? text : text.replaceAll("__ORDERING__", ordering);
};

export async function listFor(
  filter: BullionFilter = {}, executor?: Executor
): Promise<BullionStorefront[]> {
  if (filter.ids?.length === 0) return [];
  const { text, values } = where(filter);
  const { rows } = await query(
    build("list", text, ORDERINGS[filter.sort ?? "name"]), values, executor
  );
  return rows.map((row) => Storefront.parse(row));
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

export async function listTypes(executor?: Executor): Promise<string[]> {
  const { rows } = await query<{ type: string }>(sql("get_types"), [], executor);
  return rows.map((row) => row.type);
}

export async function create(patch: BullionCreate, executor?: Executor): Promise<string> {
  const { rows } = await query<{ id: string }>(
    sql("create"),
    [patch.name, patch.metal_id, patch.mint_id, patch.supplier_id],
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
