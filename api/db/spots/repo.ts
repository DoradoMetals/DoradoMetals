// spots.spots, and nothing else - one row per metal, written by the feed cron.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import { SpotPatch, type SpotPrice } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

export const PATCHABLE = Object.keys(SpotPatch.shape) as (keyof SpotPatch)[];

export async function list(executor?: Executor): Promise<SpotPrice[]> {
  const { rows } = await query<SpotPrice>(sql("get_all"), [], executor);
  return rows;
}

export async function create(
  metal_id: string, patch: SpotPatch, executor?: Executor
): Promise<void> {
  await query(
    sql("create"),
    [metal_id, patch.ask, patch.bid, patch.dollar_change, patch.percent_change],
    executor
  );
}

export async function update(
  metal_id: string, patch: SpotPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "spots.spots", allowed: PATCHABLE, patch, where: { metal_id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}
