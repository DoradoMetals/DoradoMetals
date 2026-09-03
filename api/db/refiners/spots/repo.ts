// refiners.spots, and nothing else - what the REFINER quoted, mirroring
// orders.spots' shape.
// update is keyed on (order_id, metal_id), not this table's own id: every
// caller holds that pair. `bid` is the only writable column; ask is set at create.
import { randomUUID } from "node:crypto";
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { refiners } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

// The per-metal spot row an order carries. No contract: never returned by a route on its own, only alongside an order.
// percent_change and dollar_change are projected as NULL — see sql/get_for.sql.
type OrderSpotRow = {
  id: string;
  purchase_order_id: string | null;
  type: string;
  ask_spot: number | null;
  bid_spot: number | null;
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

// The same two operations orders/spots has, against the refiner's own quote.
export type RefinerSpotRow = {
  id: string; order_id: string; metal_id: string; refiner_id: string | null;
  ask: number | null; bid: number | null;
};

// The same rows as getFor, in the CONVERTED spellings (`name`/`ask`/`bid`) — what the order pipelines and quote read speak. See sql/get_named.sql.
export type NamedSpotRow = {
  id: string;
  purchase_order_id: string | null;
  name: string;
  ask: number | null;
  bid: number | null;
  percent_change: number | null;
  dollar_change: number | null;
  created_at: Date | null;
  updated_at: Date | null;
};

export async function getNamed(
  order_id: string, executor?: Executor
): Promise<NamedSpotRow[]> {
  const { rows } = await query<NamedSpotRow>(sql("get_named"), [order_id], executor);
  return rows;
}

// NOT idempotent: this table has no unique constraint on (order_id, metal_id)
// where orders.spots does, so there is no conflict target to name. The rule
// that builds these rows filters out the metals already covered.
export type SpotNew = Pick<refiners.spots.Row, "order_id" | "metal_id" | "refiner_order_id"> &
  Partial<Pick<refiners.spots.Row, "id" | "refiner_id" | "ask" | "bid">>;

export async function create(row: SpotNew, executor?: Executor): Promise<RefinerSpotRow | undefined> {
  const { rows } = await query<RefinerSpotRow>(
    sql("create"),
    [
      row.id ?? randomUUID(), row.order_id, row.refiner_order_id, row.metal_id,
      row.refiner_id ?? null, row.ask ?? null, row.bid ?? null,
    ],
    executor
  );
  return rows[0];
}

// The verbatim refiners.spots row — what the by-order spots read serves. Every column, no join products.
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

// By the ENGAGEMENT's id (refiners.orders). The route addresses the CUSTOMER order (GET /orders/:orderId/refiners/spots); the service resolves the engagement and hands its id here.
export async function getForEngagement(
  refiner_order_id: string, executor?: Executor
): Promise<EngagementSpotRow[]> {
  const { rows } = await query<EngagementSpotRow>(
    sql("get_for_engagement"), [refiner_order_id], executor
  );
  return rows;
}

// THE SIXTH VERB (D214 item 11): a derivation that yields N rows writes them in
// one call, so the use case carries no loop of its own.
export async function createMany(
  rows: SpotNew[], executor?: Executor
): Promise<number> {
  for (const row of rows) await create(row, executor);
  return rows.length;
}

// Keyed on (order_id, metal_id): every caller holds that pair, never this table's own id — which is why buildUpdate takes a `where` map, a spot being one metal on one order.
export const PATCHABLE = ["bid"] as const;

export type SpotPatch = Partial<Pick<refiners.spots.Row, (typeof PATCHABLE)[number]>>;

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
