import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import { RatePatch, type AdminRate, type RateRead } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export const PATCHABLE = Object.keys(RatePatch.shape) as (keyof RatePatch)[];

export async function getOne(id: string, executor?: Executor): Promise<AdminRate | undefined> {
  const { rows } = await query<AdminRate>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function list(executor?: Executor): Promise<RateRead[]> {
  const { rows } = await query<RateRead>(sql("get_all"), [], executor);
  return rows;
}

export async function listAdmin(executor?: Executor): Promise<AdminRate[]> {
  const { rows } = await query<AdminRate>(sql("get_admin_all"), [], executor);
  return rows;
}

export async function create(
  patch: RatePatch & { id?: string | null }, executor?: Executor
): Promise<string> {
  const { rows } = await query<{ id: string }>(
    sql("create"),
    [patch.id ?? null, patch.metal_id, patch.unit, patch.min_qty, patch.max_qty,
     patch.scrap_pct, patch.bullion_pct],
    executor
  );
  return rows[0].id;
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
