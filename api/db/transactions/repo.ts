// payments.ledger, and nothing else.
import { randomUUID } from "node:crypto";
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { payments, NewLedgerEntry } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type LedgerRow = payments.LedgerRow;
export type { NewLedgerEntry } from "@dorado/contracts";

export async function byUser(user_id: string, executor?: Executor): Promise<LedgerRow[]> {
  const { rows } = await query<LedgerRow>(sql("by_user"), [user_id], executor);
  return rows;
}

export async function create(row: NewLedgerEntry, executor?: Executor): Promise<LedgerRow> {
  const { rows } = await query<LedgerRow>(
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
