// payments.methods, and nothing else. Verbatim MethodsRow - the wire IS the
// row, which is what lets the frontend read the same contract.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { payments } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type MethodRow = payments.MethodsRow;

export async function getAll(
  direction?: string | null,
  executor?: Executor
): Promise<MethodRow[]> {
  const { rows } = await query(sql("get_methods"), [direction ?? null], executor);
  return rows as MethodRow[];
}
