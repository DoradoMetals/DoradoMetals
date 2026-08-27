// exchange.purchase_orders. THIS FILE IS SCHEDULED FOR DELETION.
//
// exchange keeps the offer and the money as columns on the order row, so
// creating one is a single INSERT where the new schema takes two.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#features/purchase-orders/create.repo.ts";

const sql = sqlFrom(import.meta.dirname);

export async function createOrder(
  id: string, user_id: string | null, address_id: string | null,
  status: string | null, executor?: Executor
): Promise<{ id: string; order_number: number }> {
  const { rows } = await query<{ id: string; order_number: number }>(
    sql("legacy/create"), [id, user_id, address_id, status], executor
  );
  return rows[0];
}
