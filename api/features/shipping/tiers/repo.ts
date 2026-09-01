// shipping.tiers, and nothing else. Verbatim TiersRow.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { shipping } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type TierRow = shipping.TiersRow;

export async function getAll(executor?: Executor): Promise<TierRow[]> {
  const { rows } = await query(sql("get_tiers"), [], executor);
  return rows as TierRow[];
}
