// refiners.orders, and nothing else.
//
// The refiner-side ENGAGEMENT attached to a customer order (migration 093):
// which refinery has the metal, the pool ounces deducted, the remediation,
// and the refinery's fee. One row per customer order today - UNIQUE(order_id)
// - with its own uuid pk so a multi-lot future is a constraint change, not a
// rekeying.
//
// The engagement's pool and fee values are ALSO written to their exchange
// shadows (exchange.purchase_orders' columns, mirrored onto
// orders.transactions) by the existing purchase-orders services - the service
// layer above pairs each write with its shadow so the schemas stay level
// while both serve.
import query from "#shared/db/query.js";
import type { PoolClient } from "pg";

export type Executor = PoolClient | undefined;

export type RefinerOrderRow = {
  id: string;
  order_id: string;
  refiner_id: string | null;
  pool_oz_deducted: number | null;
  pool_remediation: number | null;
  fee: number | null;
  created_at: Date | null;
  updated_at: Date | null;
};

export async function findById(
  id: string, executor?: Executor
): Promise<RefinerOrderRow | undefined> {
  const { rows } = await query<RefinerOrderRow>(
    `SELECT id, order_id, refiner_id, pool_oz_deducted, pool_remediation, fee,
            created_at, updated_at
       FROM refiners.orders
      WHERE id = $1`,
    [id],
    executor
  );
  return rows[0];
}

// One column, named from a fixed list rather than interpolated from input -
// the caller picks a key, never the request.
const ENGAGEMENT_COLUMNS = {
  pool_oz_deducted: "pool_oz_deducted",
  pool_remediation: "pool_remediation",
  fee: "fee",
  refiner_id: "refiner_id",
} as const;

export type EngagementColumn = keyof typeof ENGAGEMENT_COLUMNS;

export async function setEngagementValue(
  id: string,
  column: EngagementColumn,
  value: number | string | null,
  executor?: Executor
): Promise<void> {
  const col = ENGAGEMENT_COLUMNS[column];
  if (!col) throw new Error(`no such engagement column: ${String(column)}`);
  await query(
    `UPDATE refiners.orders SET ${col} = $1, updated_at = now() WHERE id = $2`,
    [value, id],
    executor
  );
}
