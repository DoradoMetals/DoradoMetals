// exchange.account_transactions. THIS FILE IS SCHEDULED FOR DELETION.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export async function create(
  id: string, user_id: string | null, transaction_type: string,
  purchase_order_id: string | null, sales_order_id: string | null,
  amount: number | null, executor?: Executor
): Promise<void> {
  await query(sql("create"),
    [id, user_id, transaction_type, purchase_order_id, sales_order_id, amount], executor);
}
