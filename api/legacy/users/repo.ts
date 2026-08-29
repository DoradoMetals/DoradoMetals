// exchange.users. THIS FILE IS SCHEDULED FOR DELETION.
//
// The credit balance only. better-auth owns every other column here and writes
// them through its own pool, so nothing else in this application may.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { CreditMode, Executor } from "#features/users/repo.ts";

const sql = sqlFrom(import.meta.dirname);

export async function adjustCredit(
  user_id: string, mode: CreditMode, amount: number, executor?: Executor
): Promise<number> {
  const r = await query(sql("adjust_credit"), [amount, mode, user_id], executor);
  return r.rowCount ?? 0;
}
