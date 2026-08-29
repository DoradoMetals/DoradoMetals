// exchange.users. THIS FILE IS SCHEDULED FOR DELETION.
//
// The credit balance only. better-auth owns every other column here and writes
// them through its own pool, so nothing else in this application may.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { CreditMode, Executor } from "#features/users/repo.ts";

const sql = sqlFrom(import.meta.dirname);

// Returns the row count AND the balance the adjustment produced. The count is
// what tells "no such user" apart from "applied"; the balance is what the
// caller displays instead of computing it (D98).
export async function adjustCredit(
  user_id: string, mode: CreditMode, amount: number, executor?: Executor
): Promise<{ rowCount: number; dorado_funds: number | null }> {
  const r = await query<{ dorado_funds: number | null }>(
    sql("adjust_credit"), [amount, mode, user_id], executor
  );
  return { rowCount: r.rowCount ?? 0, dorado_funds: r.rows[0]?.dorado_funds ?? null };
}

// The balance, taken under a row lock for the caller's transaction. `undefined`
// means there is no such user - which is a different answer from a balance of
// null, and the service tells them apart. See sql/balance_for_update.sql.
export async function balanceForUpdate(
  user_id: string, executor?: Executor
): Promise<number | null | undefined> {
  const { rows } = await query<{ dorado_funds: number | null }>(
    sql("balance_for_update"), [user_id], executor
  );
  return rows.length === 0 ? undefined : rows[0].dorado_funds;
}
