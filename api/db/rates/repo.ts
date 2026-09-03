// rates.rates, and nothing else.
//
// No join: the metal's name is composed in domain/rates/compose.ts from one cached lookup, rather than a join on every read.
// update takes an id and a patch and answers whether a row changed; no per-column wrapper lives here.
// max_qty is nullable (null means an open-ended band): the statement is built from the keys the patch carries, so omitting max_qty leaves it untouched but sending null clears it to open-ended.
// created_by, updated_by, created_at and updated_at are the public.audit_stamp trigger's, from the actor on the connection (migration 116).
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { rates } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type RateRow = rates.rates.Row;

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
