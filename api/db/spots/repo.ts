// spots.spots, and nothing else - one row per metal, seeded by migration.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import { columnsOf } from "#shared/db/columns.ts";
import { Spot } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

// Derived from the table, not restated. Two deliberate differences: `id` is not projected (a spot is identified by its metal), and `updated_at` is a Date, not the wire's string - this is what node-postgres hands back before serialisation.
export type SpotRow = Omit<Spot, "id" | "updated_at"> & {
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

export type NewSpot = {
  metal_id: string;
  ask: number | null;
  bid: number | null;
  dollar_change: number | null;
  percent_change: number | null;
};

export async function create(row: NewSpot, executor?: Executor): Promise<SpotRow> {
  const { rows } = await query<SpotRow>(
    sql("create"),
    [row.metal_id, row.ask, row.bid, row.dollar_change, row.percent_change],
    executor
  );
  return rows[0];
}

// THE COLUMNS, FROM THE CONTRACT (ruling 64): the quote itself, without the
// row's identity and without the timestamp the feed's own statement stamps.
export const PATCHABLE = columnsOf(Spot.omit({ id: true, metal_id: true, updated_at: true }));
export type SpotQuotePatch = Partial<Record<(typeof PATCHABLE)[number], number | null>>;

export async function update(
  metal_id: string, patch: SpotQuotePatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "spots.spots", allowed: PATCHABLE, patch, where: { metal_id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}
