// auth.users, and nothing else.
//
// READS AND ONE WRITE. The only thing the application writes here is the credit
// balance; everything else about a user is better-auth's, which writes
// exchange.users directly through its own pool. That is why auth is the one
// feature with no reversible middle state - see CLAUDE.md - and why this file
// deliberately exposes no create, update or delete for a user.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { PoolClient } from "pg";

const sql = sqlFrom(import.meta.dirname);
export type Executor = PoolClient | undefined;

export type UserRow = {
  id: string; email: string; name: string;
  created_at: Date; updated_at: Date; email_verified: boolean;
  image: string | null; role: string | null;
  dorado_funds?: string | number | null;
};

export type CreditMode = "add" | "subtract" | "edit";

export async function getOne(id: string, executor?: Executor): Promise<UserRow | undefined> {
  const { rows } = await query<UserRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function getAll(executor?: Executor): Promise<UserRow[]> {
  const { rows } = await query<UserRow>(sql("get_all"), [], executor);
  return rows;
}

export async function getAdmins(executor?: Executor): Promise<UserRow[]> {
  const { rows } = await query<UserRow>(sql("get_admins"), [], executor);
  return rows;
}

// ADD AND REMOVE LIVE HERE, NOT IN transactions.
//
// They write exchange.users.dorado_funds, and this feature owns that table. They
// used to sit in features/transactions, which meant two services wrote the same
// table - the one thing the structure's guardrail forbids, because it is what
// makes "where does this get written?" unanswerable and closes the door on ever
// putting the invariant in one place.
//
// exchange.users rather than auth.users: the mirror_users_to_auth trigger
// carries it across, and writing both applies the change twice.
export async function addFunds(
  user_id: string, total: number, executor?: Executor
): Promise<number> {
  const r = await query(sql("add_funds"), [total, user_id], executor);
  return r.rowCount ?? 0;
}

export async function removeFunds(
  user_id: string, total: number, executor?: Executor
): Promise<number> {
  const r = await query(sql("remove_funds"), [total, user_id], executor);
  return r.rowCount ?? 0;
}

export async function adjustCredit(
  user_id: string, mode: CreditMode, amount: number, executor?: Executor
): Promise<number> {
  const r = await query(sql("adjust_credit"), [amount, mode, user_id], executor);
  return r.rowCount ?? 0;
}
