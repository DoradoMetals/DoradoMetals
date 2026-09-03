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
import query from "#shared/db/query.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { refiners } from "@dorado/contracts";

// The verbatim table row (ruling 12) - the generated contract is its home.
export type RefinerOrderRow = refiners.OrdersRow;

// ONE ENGAGEMENT PER ORDER, EVERY ORDER - 093's invariant, maintained by the
// create paths. Idempotent: an order that already has one keeps it untouched
// (values included), and the engagement's id comes back either way so a caller
// can link refiners.items / refiners.spots rows to it.
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

// ONE UPDATE (D212's CRUD ruling), replacing setEngagementValue's per-column
// dispatch through a fixed column map.
//
// refiner_id IS NOT A COALESCE COLUMN, and that is deliberate rather than an
// oversight: every engagement starts with it null (ensureForOrder inserts
// `(order_id)` alone), and detaching an engagement from a refinery - setting
// it back to null - is a real operation the wire contract (RefinerOrderPatch)
// names on purpose. COALESCE($n, col) cannot write a null, so refiner_id is
// carried with its own "was this field even named" flag instead: `refiner_id`
// present in the patch (checked with `in`, so an explicit null counts) means
// write it, value included; absent means leave it alone. The other three
// columns keep the plain COALESCE shape - their exchange shadows are typed
// `number` and nothing ever clears them to null (see RefinerOrderPatch's own
// header for why).
export type OrderPatch = Partial<Pick<RefinerOrderRow, "pool_oz_deducted" | "pool_remediation" | "fee">> & {
  refiner_id?: string | null;
};

export async function update(
  id: string, patch: OrderPatch, executor?: Executor
): Promise<boolean> {
  const hasRefinerId = "refiner_id" in patch;
  const { rowCount } = await query(
    `UPDATE refiners.orders
        SET pool_oz_deducted = COALESCE($1, pool_oz_deducted),
            pool_remediation = COALESCE($2, pool_remediation),
            fee = COALESCE($3, fee),
            refiner_id = CASE WHEN $4 THEN $5 ELSE refiner_id END,
            updated_at = now()
      WHERE id = $6`,
    [patch.pool_oz_deducted, patch.pool_remediation, patch.fee, hasRefinerId, patch.refiner_id, id],
    executor
  );
  return rowCount === 1;
}
