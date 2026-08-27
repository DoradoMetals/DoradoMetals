// rates.rates, and nothing else.
//
// NO JOIN. The implementation this replaces joined metals.metals on every read
// to attach the metal's NAME, which meant a row type claiming to be rates.rates
// carried a column rates.rates does not have. The name is composed in wire.ts
// from one cached lookup of four rows instead.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { rates } from "@dorado/contracts";
import type { PoolClient } from "pg";

const sql = sqlFrom(import.meta.dirname);

export type RateRow = rates.RatesRow;
export type Executor = PoolClient | undefined;

export type RateInput = Pick<RateRow, "metal_id" | "unit" | "min_qty" | "max_qty" | "scrap_pct" | "bullion_pct"> &
  Partial<Pick<RateRow, "created_by" | "updated_by">>;

const writable = (r: RateInput) => [
  r.metal_id, r.unit, r.min_qty, r.max_qty,
  r.scrap_pct, r.bullion_pct, r.created_by ?? null, r.updated_by ?? null,
];

export async function getOne(id: string, executor?: Executor): Promise<RateRow | undefined> {
  const { rows } = await query<RateRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function getAll(executor?: Executor): Promise<RateRow[]> {
  const { rows } = await query<RateRow>(sql("get_all"), [], executor);
  return rows;
}

export async function create(id: string, rate: RateInput, executor?: Executor): Promise<RateRow> {
  const { rows } = await query<RateRow>(sql("create"), [id, ...writable(rate)], executor);
  return rows[0];
}

export async function update(
  rate: RateInput & { id: string },
  user_name: string,
  executor?: Executor
): Promise<RateRow | undefined> {
  const { rows } = await query<RateRow>(
    sql("update"),
    [rate.metal_id, rate.unit, rate.min_qty, rate.max_qty,
     rate.scrap_pct, rate.bullion_pct, rate.created_by ?? null, user_name, rate.id],
    executor
  );
  return rows[0];
}

export async function remove(id: string, executor?: Executor): Promise<number> {
  const result = await query(sql("delete"), [id], executor);
  return result.rowCount ?? 0;
}
