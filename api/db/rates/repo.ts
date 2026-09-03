// rates.rates, and nothing else.
//
// NO JOIN. The metal's NAME is composed in domain/rates/compose.ts from one
// cached lookup of four rows, rather than a join on every read that would put
// a column into a row type claiming to be rates.rates.
//
// update takes an id and a patch and answers whether a row changed (D212's
// CRUD ruling); no per-column wrapper lives here.
//
// KNOWN LIMIT OF THE COALESCE PATCH: max_qty is nullable (null means
// open-ended), and COALESCE($n, col) cannot distinguish "leave max_qty alone"
// from "clear it to open-ended" - both arrive as null. Every other patchable
// column here is non-null, so this is the one place it matters; clearing
// max_qty today means recreating the band.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { rates } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type RateRow = rates.RatesRow;

// An explicit id wins on create; omitting one lets create.sql generate one.
export type NewRate = Pick<
  RateRow, "metal_id" | "unit" | "min_qty" | "max_qty" | "scrap_pct" | "bullion_pct"
> &
  Partial<Pick<RateRow, "created_by" | "updated_by">> &
  { id?: string | null };

export type RatePatch = Partial<
  Pick<
    RateRow,
    "metal_id" | "unit" | "min_qty" | "max_qty" | "scrap_pct" | "bullion_pct" | "created_by" | "updated_by"
  >
>;

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
    [
      row.id ?? null, row.metal_id, row.unit, row.min_qty, row.max_qty,
      row.scrap_pct, row.bullion_pct, row.created_by ?? null, row.updated_by ?? null,
    ],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: RatePatch, executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(
    sql("update"),
    [
      patch.metal_id ?? null, patch.unit ?? null, patch.min_qty ?? null, patch.max_qty ?? null,
      patch.scrap_pct ?? null, patch.bullion_pct ?? null, patch.created_by ?? null,
      patch.updated_by ?? null, id,
    ],
    executor
  );
  return rowCount === 1;
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
