// spots.spots, and nothing else.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { PoolClient } from "pg";

const sql = sqlFrom(import.meta.dirname);
export type Executor = PoolClient | undefined;

export type SpotRow = {
  metal_id: string;
  ask: number | null; bid: number | null;
  percent_change: number | null; dollar_change: number | null;
  updated_at: Date;
};

export type Quote = {
  ask?: number | null; bid?: number | null;
  dollarChange?: number | null; percentChange?: number | null;
};

export async function getAll(executor?: Executor): Promise<SpotRow[]> {
  const { rows } = await query<SpotRow>(sql("get_all"), [], executor);
  return rows;
}

export async function upsert(metal_id: string, q: Quote, executor?: Executor): Promise<void> {
  await query(
    sql("upsert"),
    [metal_id, q.ask ?? null, q.bid ?? null, q.dollarChange ?? null, q.percentChange ?? null],
    executor
  );
}
