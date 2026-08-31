// exchange.purchase_orders. THIS FILE IS SCHEDULED FOR DELETION.
//
// exchange keeps the offer and the money as columns on the order row, so
// creating one is a single INSERT where the new schema takes two.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// `order_number` is the number sql/create.sql already drew for orders.orders -
// passed through so exchange's column DEFAULT never draws the sequence again.
export async function createOrder(
  id: string, user_id: string | null, address_id: string | null,
  status: string | null, order_number: number, executor?: Executor
): Promise<{ id: string; order_number: number }> {
  const { rows } = await query<{ id: string; order_number: number }>(
    sql("create"), [id, user_id, address_id, status, order_number], executor
  );
  return rows[0];
}
