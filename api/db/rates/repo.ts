// rates.rates, and nothing else.
//
// NO JOIN. The metal's NAME is composed in domain/rates/compose.ts from one
// cached lookup of four rows, rather than a join on every read that would put
// a column into a row type claiming to be rates.rates.
//
// update takes an id and a patch and answers whether a row changed (D212's
// CRUD ruling); no per-column wrapper lives here.
//
// THE COALESCE LIMIT ON max_qty IS FIXED. This repo's header used to record
// that max_qty is nullable (null means an open-ended band) and that
// `COALESCE($n, col)` could not tell "leave it alone" from "clear it", so
// clearing one meant deleting the band and making a new one. The statement is
// built from the keys the patch carries now (shared/db/patch.ts): omit max_qty
// and it is untouched, send `max_qty: null` and the band becomes open-ended.
//
// NOBODY PASSES AN AUTHOR ANY MORE. created_by, updated_by, created_at and
// updated_at are the public.audit_stamp trigger's, taken from the actor on the
// connection (migration 116, shared/http/actor.ts).
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { rates } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type RateRow = rates.RatesRow;

// An explicit id wins on create; omitting one lets create.sql generate one.
export type NewRate = Pick<
  RateRow, "metal_id" | "unit" | "min_qty" | "max_qty" | "scrap_pct" | "bullion_pct"
> &
  { id?: string | null };

export const PATCHABLE = [
  "metal_id", "unit", "min_qty", "max_qty", "scrap_pct", "bullion_pct",
] as const;

export type RatePatch = Partial<Pick<RateRow, (typeof PATCHABLE)[number]>>;

export async function getOne(id: string, executor?: Executor): Promise<RateRow | undefined> {
  const { rows } = await query<RateRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function list(executor?: Executor): Promise<RateRow[]> {
  const { rows } = await query<RateRow>(sql("get_all"), [], executor);
  return rows;
}

export async function create(row: NewRate, executor?: Executor): Promise<RateRow> {
  const { rows } = await query<RateRow>(
    sql("create"),
    [row.id, row.metal_id, row.unit, row.min_qty, row.max_qty, row.scrap_pct, row.bullion_pct],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: RatePatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "rates.rates", allowed: PATCHABLE, patch, where: { id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
