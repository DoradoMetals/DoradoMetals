import query from "#shared/db/query.ts";
import type { Payout } from "@dorado/contracts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export async function getFor(
  order_id: string, executor?: Executor
): Promise<Payout | undefined> {
  const { rows } = await query<Payout>(sql("get_for"), [order_id], executor);
  return rows[0];
}

export async function getMany(
  order_ids: string[], executor?: Executor
): Promise<Payout[]> {
  if (order_ids.length === 0) return [];
  const { rows } = await query<Payout>(sql("get_many"), [order_ids], executor);
  return rows;
}

export async function getById(
  id: string, executor?: Executor
): Promise<Payout | undefined> {
  const { rows } = await query<Payout>(sql("get_by_id"), [id], executor);
  return rows[0];
}
