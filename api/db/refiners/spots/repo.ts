// refiners.spots, and nothing else.
//
// What the REFINER quoted for an order, as against what the customer was
// quoted. Same shape as orders.spots deliberately, so the two can be read and
// composed the same way - the difference is whose price it is.
//
// create takes THE ROW (CRUD-batch-3); its shape is Pick<refiners.SpotsRow, ...>
// - the generated contract row is the type's home, the same way ItemPatch in
// refiners/items/repo.ts derives from refiners.ItemsRow.
//
// update REPLACES setBid, and is keyed on (order_id, metal_id) rather than
// this table's own `id` - every caller of the old function held that pair,
// never the row's id, so that stays the real key. `bid` is the only writable
// column any caller has ever needed; ask is set only at create.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { refiners } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

// The per-metal spot row an order carries. No contract: it is never returned by
// a route on its own, only alongside an order.
//
// percent_change and dollar_change are projected as NULL - see sql/get_for.sql.
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

// THE WRITES.
//
// The same two operations orders/spots has, against the refiner's own quote.
// exchange kept these in refiner_metals, keyed by metal NAME with a column per
// kind of order; here the metal is a foreign key and there is one order id.
export type RefinerSpotRow = {
  id: string; order_id: string; metal_id: string; refiner_id: string | null;
  ask: number | null; bid: number | null;
};

// The same rows as getFor, in the CONVERTED spellings (`name`/`ask`/`bid`) -
// what the order pipelines and the quote read speak. See sql/get_named.sql.
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

// NOT idempotent, and see sql/create.sql for why: this table has no unique
// constraint on (order_id, metal_id) where orders.spots does, so there is no
// conflict target to name.
export type SpotNew = Pick<
  refiners.SpotsRow, "id" | "order_id" | "metal_id" | "refiner_id" | "ask" | "bid"
>;

export async function create(row: SpotNew, executor?: Executor): Promise<RefinerSpotRow | undefined> {
  const { rows } = await query<RefinerSpotRow>(
    sql("create"), [row.id, row.order_id, row.metal_id, row.refiner_id, row.ask, row.bid], executor
  );
  return rows[0];
}

// The VERBATIM refiners.spots row (ruling 12) - what the by-order spots read
// serves. Every column, no join products.
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

// By the ENGAGEMENT's id (refiners.orders, 093). The route addresses the
// CUSTOMER order (GET /orders/:orderId/refiners/spots); the service resolves
// the engagement and hands its id here.
export async function getForEngagement(
  refiner_order_id: string, executor?: Executor
): Promise<EngagementSpotRow[]> {
  const { rows } = await query<EngagementSpotRow>(
    sql("get_for_engagement"), [refiner_order_id], executor
  );
  return rows;
}

// EVERY CUSTOMER SPOT GETS ITS REFINER COUNTERPART - 093's mirror completion,
// applied to new traffic. Unquoted (ask and bid NULL) until the refiner
// speaks; refiner_order_id links it to the order's engagement. Idempotent on
// (order, metal) by the NOT EXISTS guard - the table itself has no unique
// constraint to name, see sql/create.sql.
export async function coverFromOrderSpots(
  order_id: string, executor?: Executor
): Promise<void> {
  await query(
    `INSERT INTO refiners.spots (order_id, refiner_order_id, metal_id)
     SELECT os.order_id, ro.id, os.metal_id
       FROM orders.spots os
       JOIN refiners.orders ro ON ro.order_id = os.order_id
      WHERE os.order_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM refiners.spots rs
           WHERE rs.order_id = os.order_id AND rs.metal_id = os.metal_id
        )`,
    [order_id],
    executor
  );
}

// ONE UPDATE (D212's CRUD ruling, replacing setBid, itself already one
// function for two exchange ones - updateRefinerMetals and updateRefinerSpot
// were the same statement). Keyed on (order_id, metal_id): every caller holds
// that pair, never this table's own id.
// ONE STATEMENT FOR TWO EXCHANGE FUNCTIONS, exactly as in orders/spots:
// updateRefinerMetals looped over a list and updateRefinerSpot took one, but
// the UPDATE was character-for-character the same. The loop is the caller's.
//
// KEYED ON TWO COLUMNS, which is why buildUpdate takes a `where` map: a spot
// is one metal on one order.
export const PATCHABLE = ["bid"] as const;

export type SpotPatch = Partial<Pick<refiners.SpotsRow, (typeof PATCHABLE)[number]>>;

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
