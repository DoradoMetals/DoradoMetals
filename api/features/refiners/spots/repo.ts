// refiners.spots, and nothing else.
//
// What the REFINER quoted for an order, as against what the customer was
// quoted. Same shape as orders.spots deliberately, so the two can be read and
// composed the same way - the difference is whose price it is.
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

// THE WRITES.
//
// The same two operations orders/spots has, against the refiner's own quote.
// exchange kept these in refiner_metals, keyed by metal NAME with a column per
// kind of order; here the metal is a foreign key and there is one order id.
export type RefinerSpotRow = {
  id: string; order_id: string; metal_id: string; refiner_id: string | null;
  ask: number | null; bid: number | null;
};

// NOT idempotent, and see sql/create.sql for why: this table has no unique
// constraint on (order_id, metal_id) where orders.spots does, so there is no
// conflict target to name.
export async function create(
  id: string, order_id: string, metal_id: string, refiner_id: string | null,
  ask: number | null, bid: number | null, executor?: Executor
): Promise<RefinerSpotRow | undefined> {
  const { rows } = await query<RefinerSpotRow>(
    sql("create"), [id, order_id, metal_id, refiner_id, ask, bid], executor
  );
  return rows[0];
}

// ONE FUNCTION FOR TWO EXCHANGE ONES - updateRefinerMetals and
// updateRefinerSpot were the same UPDATE.
export async function setBid(
  order_id: string, metal_id: string, bid: number | null, executor?: Executor
): Promise<RefinerSpotRow | undefined> {
  const { rows } = await query<RefinerSpotRow>(sql("set_bid"), [bid, order_id, metal_id], executor);
  return rows[0];
}
