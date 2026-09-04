// payments.ledger, and nothing else.
import { randomUUID } from "node:crypto";
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { AccountTransaction, LedgerEntry, LedgerEntryPatch } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);


// THE HISTORY, ALREADY IN THE WIRE'S OWN NAMES. by_user.sql joins the order for
// its direction and aliases `type` to `transaction_type`, so there is nothing
// left to compose - domain/transactions/compose.ts, which did both in JS over a
// second round trip, is deleted.
export async function byUser(
  user_id: string, executor?: Executor
): Promise<AccountTransaction[]> {
  const { rows } = await query<AccountTransaction>(sql("by_user"), [user_id], executor);
  return rows;
}

export async function create(row: LedgerEntryPatch, executor?: Executor): Promise<LedgerEntry> {
  const { rows } = await query<LedgerEntry>(
    sql("create"),
    [row.id ?? randomUUID(), row.user_id, row.type, row.order_id, row.amount],
    executor
  );
  return rows[0];
}

export async function hasCreditFor(order_id: string, executor?: Executor): Promise<boolean> {
  const { rows } = await query<{ refunded: boolean }>(sql("has_credit_for"), [order_id], executor);
  return rows[0]?.refunded === true;
}
