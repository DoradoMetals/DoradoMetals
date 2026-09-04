// orders.spots - CRUD only. The spots an order was quoted at. EVERY money
// figure on the order derives from these, so a wrong one misprices all of it.
import { randomUUID } from "node:crypto";
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// The metal's NAME joined on - what the PDFs, the emails and the refiner
// surfaces read. percent_change and dollar_change are projected NULL.
export type OrderSpotRow = {
  id: string;
  order_id: string | null;
  name: string;
  ask: number | null;
  bid: number | null;
  percent_change: number | null;
  dollar_change: number | null;
  created_at: Date | null;
  updated_at: Date | null;
};

export async function getFor(
  order_id: string, executor?: Executor
): Promise<OrderSpotRow[]> {
  const { rows } = await query<OrderSpotRow>(sql("get_for"), [order_id], executor);
  return rows;
}

export async function getMany(
  order_ids: string[], executor?: Executor
): Promise<OrderSpotRow[]> {
  if (order_ids.length === 0) return [];
  const { rows } = await query<OrderSpotRow>(sql("get_many"), [order_ids], executor);
  return rows;
}

// The VERBATIM table rows (ruling 12) - what GET /orders/:id/spots serves.
export type OrderSpotRawRow = {
  id: string;
  metal_id: string;
  order_id: string;
  ask: number | null;
  bid: number | null;
  scrap_percentage: number | null;
  bullion_percentage: number | null;
  created_at: Date | null;
  updated_at: Date | null;
};

export async function getRowsFor(
  order_id: string, executor?: Executor
): Promise<OrderSpotRawRow[]> {
  const { rows } = await query<OrderSpotRawRow>(sql("get_rows_for"), [order_id], executor);
  return rows;
}

export type SpotRow = {
  id: string; order_id: string; metal_id: string;
  ask: number | null; bid: number | null;
};

// Idempotent: (order_id, metal_id) is UNIQUE, so a repeat does nothing.
export type NewOrderSpot = {
  id?: string; order_id: string; metal_id: string;
  ask?: number | null; bid?: number | null;
};

export async function create(row: NewOrderSpot, executor?: Executor): Promise<SpotRow | undefined> {
  const { rows } = await query<SpotRow>(
    sql("create"),
    [row.id ?? randomUUID(), row.order_id, row.metal_id, row.ask ?? null, row.bid ?? null],
    executor
  );
  return rows[0];
}

// THE SIXTH VERB (D214 item 11): a derivation that yields N rows writes them in
// one call, so the use case reads
// `await orderSpots.createMany(rules.spotsToFreeze(...), tx)` and carries no
// loop of its own.
export async function createMany(
  rows: NewOrderSpot[], executor?: Executor
): Promise<number> {
  for (const row of rows) await create(row, executor);
  return rows.length;
}

// ONE UPDATE, keyed on (order_id, metal_id). `bid` ONLY: the ask is what the
// same metal sells for, and writing it here would lose a number this never owned.
export const PATCHABLE = ["bid"] as const;
export type SpotPatch = Partial<Record<(typeof PATCHABLE)[number], number | null>>;

export async function update(
  order_id: string, metal_id: string, patch: SpotPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "orders.spots",
    allowed: PATCHABLE,
    patch,
    where: { order_id, metal_id },
    returning: "id",
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}
