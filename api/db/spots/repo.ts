// spots.spots, and nothing else - upsert-by-metal, no per-row lifecycle: one row per metal seeded by migration, and upsert is the only write the application makes.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { spots } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

// Derived from the table, not restated. Two deliberate differences: `id` is not projected (a spot is identified by its metal), and `updated_at` is a Date, not the wire's string - this is what node-postgres hands back before serialisation.
export type SpotRow = Omit<spots.SpotsRow, "id" | "updated_at"> & {
  updated_at: Date;
};

export type Quote = {
  ask?: number | null; bid?: number | null;
  dollarChange?: number | null; percentChange?: number | null;
};

export async function list(executor?: Executor): Promise<SpotRow[]> {
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
