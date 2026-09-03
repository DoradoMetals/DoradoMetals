// The users feature's tables: it READS auth.users and WRITES exchange.users - backwards from every other feature because better-auth (not us) writes auth's source, exchange.users, through its own pool, and migration 056's trigger mirrors it into auth.users for us to read.
// Writing the balance to auth.users instead loses money: the trigger's ON CONFLICT DO UPDATE reverts it from exchange's row on the next better-auth write of any kind. One write per balance, to exchange.users, ever.
// users: adjustCredit is the ledger exception to CRUD - a FOR UPDATE-locked operation, not a bare patch. No create/remove/generic update for a user; everything but the balance is better-auth's.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type UserRow = {
  id: string; email: string; name: string;
  created_at: Date; updated_at: Date; email_verified: boolean;
  image: string | null; role: string | null;
  dorado_funds?: string | number | null;
};

export type CreditMode = "add" | "subtract" | "edit";

// reads: auth.users

export async function getOne(id: string, executor?: Executor): Promise<UserRow | undefined> {
  const { rows } = await query<UserRow>(sql("get_one"), [id], executor);
  return rows[0];
}

// Every user, ordered by role then id. getAdmins() sorts differently (name DESC, id DESC) so is kept separate rather than folded in as a filter.
export async function list(executor?: Executor): Promise<UserRow[]> {
  const { rows } = await query<UserRow>(sql("get_all"), [], executor);
  return rows;
}

export async function getAdmins(executor?: Executor): Promise<UserRow[]> {
  const { rows } = await query<UserRow>(sql("get_admins"), [], executor);
  return rows;
}

// writes: exchange.users.dorado_funds - the one write, kept out of transactions so only one place ever writes this table.
// Returns row count AND the resulting balance: count tells "no such user" from "applied"; balance is what the caller displays instead of computing it.
export async function adjustCredit(
  user_id: string, mode: CreditMode, amount: number, executor?: Executor
): Promise<{ rowCount: number; dorado_funds: number | null }> {
  const r = await query<{ dorado_funds: number | null }>(
    sql("adjust_credit"), [amount, mode, user_id], executor
  );
  return { rowCount: r.rowCount ?? 0, dorado_funds: r.rows[0]?.dorado_funds ?? null };
}

// The balance, under a row lock for the caller's transaction. `undefined` (no such user) differs from a balance of null, and the service tells them apart.
export async function balanceForUpdate(
  user_id: string, executor?: Executor
): Promise<number | null | undefined> {
  const { rows } = await query<{ dorado_funds: number | null }>(
    sql("balance_for_update"), [user_id], executor
  );
  return rows.length === 0 ? undefined : rows[0].dorado_funds;
}
