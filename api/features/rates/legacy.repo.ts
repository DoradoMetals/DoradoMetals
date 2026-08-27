// exchange.rates, and nothing else. THIS FILE IS SCHEDULED FOR DELETION.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { RateInput, Executor } from "#features/rates/repo.ts";

const sql = sqlFrom(import.meta.dirname);

export async function create(id: string, r: RateInput, executor?: Executor): Promise<void> {
  await query(sql("legacy/create"),
    [id, r.metal_id, r.unit, r.min_qty, r.max_qty, r.scrap_pct, r.bullion_pct,
     r.created_by ?? null, r.updated_by ?? null], executor);
}

export async function update(
  r: RateInput & { id: string }, user_name: string, executor?: Executor
): Promise<void> {
  await query(sql("legacy/update"),
    [r.metal_id, r.unit, r.min_qty, r.max_qty, r.scrap_pct, r.bullion_pct,
     r.created_by ?? null, user_name, r.id], executor);
}

export async function remove(id: string, executor?: Executor): Promise<void> {
  await query(sql("legacy/delete"), [id], executor);
}
