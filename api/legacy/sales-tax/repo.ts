// exchange.state_sales_tax. THIS FILE IS SCHEDULED FOR DELETION.
//
// Writes only. The rules are READ from the new schema alone - they are seeded
// reference data that no application code writes, so there is nothing to mirror.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export async function accrue(amount: number, state: string, executor?: Executor): Promise<void> {
  await query(sql("accrue"), [amount, state], executor);
}
