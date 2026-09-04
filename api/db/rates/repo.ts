// rates.rates, and nothing else.
//
// The metal's NAME is joined by the statements rather than attached in JS: it
// is what every caller keys on and what both reads order by.
// max_qty is nullable (null means an open-ended band): the UPDATE is built
// from the keys the patch carries, so omitting max_qty leaves it untouched
// but sending null clears it to open-ended.
// created_by/updated_by/created_at/updated_at are the public.audit_stamp
// trigger's, from the actor on the connection (migration 116).
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import { RatePatch, type AdminRate, type RateRead } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// Derived from the contract, never restated (ruling 64).
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

// ONE WRITE TYPE, AND A CREATE SENDS IT TOO (Jacob, 2026-09-03: "For new, it
// can just send the patch!!"). An explicit id wins; omitting one lets the
// statement generate it. A column the table needs and the patch does not
// carry comes back as the shared pg-error translation naming it.
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
