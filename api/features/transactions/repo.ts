// payments.ledger, and nothing else.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { payments } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type LedgerRow = payments.LedgerRow;

export async function byUser(user_id: string, executor?: Executor): Promise<LedgerRow[]> {
  const { rows } = await query<LedgerRow>(sql("by_user"), [user_id], executor);
  return rows;
}

export async function create(
  id: string, user_id: string | null, type: string,
  order_id: string | null, amount: number | null, executor?: Executor
): Promise<LedgerRow> {
  const { rows } = await query<LedgerRow>(sql("create"), [id, user_id, type, order_id, amount], executor);
  return rows[0];
}
