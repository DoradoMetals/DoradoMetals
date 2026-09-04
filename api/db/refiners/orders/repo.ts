// refiners.orders, and nothing else - the refiner-side ENGAGEMENT attached to
// a customer order: which refinery has the metal, pool ounces deducted,
// remediation, and fee. One row per order (UNIQUE(order_id)), own uuid pk so a
// multi-lot future is a constraint change rather than a rekeying.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { RefinerOrder } from "@dorado/contracts";
import { columnsOf } from "#shared/db/columns.ts";
import { RefinerOrderPatch } from "@dorado/contracts";

// The verbatim table row (ruling 12) - the generated contract is its home.

// The engagement row for an order. The caller reads first and creates only
// when there is none (D214 item 11: repos are the five verbs, the service asks
// the question), so this is a plain INSERT.
export type NewRefinerOrder = Pick<RefinerOrder, "order_id">;

export async function create(
  row: NewRefinerOrder, executor?: Executor
): Promise<RefinerOrder> {
  const { rows } = await query<RefinerOrder>(
    `INSERT INTO refiners.orders (order_id) VALUES ($1)
     RETURNING id, order_id, refiner_id, pool_oz_deducted, pool_remediation, fee,
               created_at, updated_at`,
    [row.order_id],
    executor
  );
  return rows[0];
}

export async function findByOrder(
  order_id: string, executor?: Executor
): Promise<RefinerOrder | undefined> {
  const { rows } = await query<RefinerOrder>(
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
): Promise<RefinerOrder | undefined> {
  const { rows } = await query<RefinerOrder>(
    `SELECT id, order_id, refiner_id, pool_oz_deducted, pool_remediation, fee,
            created_at, updated_at
       FROM refiners.orders
      WHERE id = $1`,
    [id],
    executor
  );
  return rows[0];
}

// refiner_id is nullable and clearing it is a real operation, so it is carried
// by "was this field named" rather than by COALESCE.
export type OrderPatch = Partial<Pick<RefinerOrder, "pool_oz_deducted" | "pool_remediation" | "fee">> & {
  refiner_id?: string | null;
};

// THE COLUMNS, FROM THE CONTRACT (ruling 64). `spots` is on the patch and is
// not a column of this table - the refinery's bid per metal is refiners.spots,
// written by its own repo - so it is the one field dropped.
export const PATCHABLE = columnsOf(RefinerOrderPatch.omit({ spots: true }));

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
