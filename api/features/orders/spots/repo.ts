// orders.spots, and nothing else.
//
// The spot prices an order was quoted at, frozen when its offer locked. Every
// money figure on the order derives from these, so a wrong one misprices the
// whole order rather than displaying something odd.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { PoolClient } from "pg";

const sql = sqlFrom(import.meta.dirname);

export type Executor = PoolClient | undefined;

// The per-metal spot row an order carries. No contract: it is never returned by
// a route on its own, only alongside an order.
//
// percent_change and dollar_change are projected as NULL - see sql/get_for.sql.
export type OrderSpotRow = {
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

export async function getFor(
  order_id: string, executor?: Executor
): Promise<OrderSpotRow[]> {
  const { rows } = await query<OrderSpotRow>(sql("get_for"), [order_id], executor);
  return rows;
}

// The VERBATIM table rows (ruling 12) - what GET /orders/:id/spots serves.
// Every column of orders.spots, no join products; the composed shape above
// stays for the internal readers that want the metal's name resolved.
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

export async function getMany(
  order_ids: string[], executor?: Executor
): Promise<OrderSpotRow[]> {
  if (order_ids.length === 0) return [];
  const { rows } = await query<OrderSpotRow>(sql("get_many"), [order_ids], executor);
  return rows;
}

// THE WRITES.
//
// exchange.order_metals named its metal as TEXT and carried a column for each
// kind of order; here the metal is a foreign key and there is one order id. The
// caller resolves the name to an id once - it already holds the metals - rather
// than this doing a lookup per row.
export type SpotRow = {
  id: string; order_id: string; metal_id: string;
  ask: number | null; bid: number | null;
};

// Idempotent: (order_id, metal_id) is UNIQUE, so a second call for the same
// pair does nothing rather than raising. exchange's insertOrderMetals had no
// conflict handling and would have.
export async function create(
  id: string, order_id: string, metal_id: string,
  ask: number | null, bid: number | null, executor?: Executor
): Promise<SpotRow | undefined> {
  const { rows } = await query<SpotRow>(
    sql("create"), [id, order_id, metal_id, ask, bid], executor
  );
  return rows[0];
}

// ONE FUNCTION FOR TWO EXCHANGE ONES. updateOrderMetals looped over a list and
// updateSpot took one, but the statement was identical - so the loop lives in
// the caller and this is the single write.
export async function setBid(
  order_id: string, metal_id: string, bid: number | null, executor?: Executor
): Promise<SpotRow | undefined> {
  const { rows } = await query<SpotRow>(sql("set_bid"), [bid, order_id, metal_id], executor);
  return rows[0];
}

// The bid only - see sql/clear_bids.sql for why the ask is left alone.
export async function clearBids(
  order_id: string, executor?: Executor
): Promise<string[]> {
  const { rows } = await query<{ id: string }>(sql("clear_bids"), [order_id], executor);
  return rows.map((r) => r.id);
}
