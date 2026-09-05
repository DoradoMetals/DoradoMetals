import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { AdminUser, CreditOp, UserCredit } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export async function getOne(id: string, executor?: Executor): Promise<AdminUser | undefined> {
  const { rows } = await query<AdminUser>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function list(executor?: Executor): Promise<AdminUser[]> {
  const { rows } = await query<AdminUser>(sql("get_all"), [], executor);
  return rows;
}

export async function getAdmins(executor?: Executor): Promise<AdminUser[]> {
  const { rows } = await query<AdminUser>(sql("get_admins"), [], executor);
  return rows;
}

export async function adjustCredit(
  user_id: string, mode: CreditOp, amount: number, executor?: Executor
): Promise<UserCredit | undefined> {
  const { rows } = await query<UserCredit>(
    sql("adjust_credit"), [amount, mode, user_id], executor
  );
  return rows[0];
}

export async function balanceForUpdate(
  user_id: string, executor?: Executor
): Promise<number | null | undefined> {
  const { rows } = await query<{ dorado_funds: number | null }>(
    sql("balance_for_update"), [user_id], executor
  );
  return rows.length === 0 ? undefined : rows[0].dorado_funds;
}

export async function balance(
  user_id: string, executor?: Executor
): Promise<number | null | undefined> {
  const { rows } = await query<{ dorado_funds: number | null }>(
    sql("balance"), [user_id], executor
  );
  return rows.length === 0 ? undefined : rows[0].dorado_funds;
}

export async function exists(id: string, executor?: Executor): Promise<boolean> {
  const { rows } = await query(sql("exists"), [id], executor);
  return rows.length > 0;
}
