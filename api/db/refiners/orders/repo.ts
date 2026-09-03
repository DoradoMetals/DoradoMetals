// refiners.orders, and nothing else — the refiner-side ENGAGEMENT attached to a customer order: which refinery has the metal, pool ounces deducted, remediation, and fee. One row per order (UNIQUE(order_id)), own uuid pk so a multi-lot future is a constraint change, not a rekeying.
// Pool and fee values are ALSO written to their exchange shadows by the purchase-orders services above, pairing each write with its shadow so both schemas stay level.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { refiners } from "@dorado/contracts";

// The verbatim table row (ruling 12) - the generated contract is its home.
export type RefinerOrderRow = refiners.OrdersRow;

// One engagement per order, every order — idempotent: an order that already has one keeps it untouched, and the id comes back either way so callers can link refiners.items/spots rows to it.
export async function ensureForOrder(
  order_id: string, executor?: Executor
): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO refiners.orders (order_id) VALUES ($1)
     ON CONFLICT (order_id) DO NOTHING
     RETURNING id`,
    [order_id],
    executor
  );
  if (rows[0]) return rows[0].id;
  const { rows: existing } = await query<{ id: string }>(
    `SELECT id FROM refiners.orders WHERE order_id = $1`, [order_id], executor
  );
  return existing[0].id;
}

export async function findByOrder(
  order_id: string, executor?: Executor
): Promise<RefinerOrderRow | undefined> {
  const { rows } = await query<RefinerOrderRow>(
    `SELECT id, order_id, refiner_id, pool_oz_deducted, pool_remediation, fee,
            created_at, updated_at
       FROM refiners.orders
      WHERE order_id = $1`,
    [order_id],
    executor
  );
  return rows[0];
}

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

// refiner_id is NOT a COALESCE column, deliberately: every engagement starts null, and clearing it back to null is a real operation COALESCE can't express, so it's carried by a "was this field named" check (`in`) instead.
// The other three columns keep plain COALESCE — their exchange shadows are typed `number` and nothing ever clears them to null.
export type OrderPatch = Partial<Pick<RefinerOrderRow, "pool_oz_deducted" | "pool_remediation" | "fee">> & {
  refiner_id?: string | null;
};

export const PATCHABLE = [
  "pool_oz_deducted", "pool_remediation", "fee", "refiner_id",
] as const;

export async function update(
  id: string, patch: OrderPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "refiners.orders", allowed: PATCHABLE, patch, where: { id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}
