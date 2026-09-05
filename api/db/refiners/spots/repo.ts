import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import { columnsOf } from "#shared/db/columns.ts";
import { RefinerSpot } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

export type RefinerSpotRow = {
  id: string; order_id: string; metal_id: string; refiner_id: string | null;
  ask: number | null; bid: number | null;
};

export type OrderBid = Pick<RefinerSpot, "id" | "order_id" | "metal_id" | "ask" | "bid">;

export async function getForOrder(
  order_id: string, executor?: Executor
): Promise<OrderBid[]> {
  const { rows } = await query<OrderBid>(sql("get_for_order"), [order_id], executor);
  return rows;
}

export type SpotNew = Pick<RefinerSpot, "order_id" | "metal_id" | "refiner_order_id"> &
  Partial<Pick<RefinerSpot, "refiner_id" | "ask" | "bid">>;

export async function create(row: SpotNew, executor?: Executor): Promise<RefinerSpotRow | undefined> {
  const { rows } = await query<RefinerSpotRow>(
    sql("create"),
    [
      row.order_id, row.refiner_order_id, row.metal_id,
      row.refiner_id ?? null, row.ask ?? null, row.bid ?? null,
    ],
    executor
  );
  return rows[0];
}

export type EngagementSpotRow = {
  id: string;
  metal_id: string;
  refiner_id: string | null;
  order_id: string;
  pool_oz_deducted: number | null;
  ask: number | null;
  bid: number | null;
  scrap_percentage: number | null;
  bullion_percentage: number | null;
  created_at: Date | null;
  updated_at: Date | null;
  refiner_order_id: string | null;
};

export async function getForEngagement(
  refiner_order_id: string, executor?: Executor
): Promise<EngagementSpotRow[]> {
  const { rows } = await query<EngagementSpotRow>(
    sql("get_for_engagement"), [refiner_order_id], executor
  );
  return rows;
}

export async function createMany(
  rows: SpotNew[], executor?: Executor
): Promise<number> {
  for (const row of rows) await create(row, executor);
  return rows.length;
}

export const PATCHABLE = columnsOf(RefinerSpot.pick({ bid: true }));

export type SpotPatch = Partial<Pick<RefinerSpot, (typeof PATCHABLE)[number]>>;

export async function update(
  order_id: string, metal_id: string, patch: SpotPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "refiners.spots", allowed: PATCHABLE, patch, where: { order_id, metal_id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}
