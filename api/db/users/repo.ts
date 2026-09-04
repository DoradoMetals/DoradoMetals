// The users feature's table: auth.users, read and written.
//
// NO CREATE, REMOVE, OR GENERIC UPDATE FOR A USER. Everything about a user
// except the credit balance is better-auth's, and the balance is not a bare
// patch either - CRUD-ifying it (Jacob's ruling) carries a named EXCEPTION for
// exactly this table: the write is a ledger operation with FOR UPDATE
// semantics, so `adjustCredit` is the one write this feature keeps, built on
// `balanceForUpdate`'s locked read.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { AdminUser, CreditOp } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// ONE ROW SHAPE FOR ALL THREE READS, AND IT IS THE CONTRACT'S. get_one used to
// omit dorado_funds and phone_number while get_all carried the balance, so the
// type had to declare it optional and every caller had to cope with a field
// that might not be there. The three statements project the same columns now.
//
// `AdminUser` replaces the hand-written copy, which had drifted: the contract
// declares `isAnonymous` (ruling 63's visitor flag) and none of the three
// statements projected it, so the wire promised a column the reads did not
// send. They project it now.
//
// THE ROW IS `AdminUser` (rulings 60-61) - there is no `UserRow` alias any
// more; one type with two names is one a reader has to check.

// ---- reads -----------------------------------------------------------------

export async function getOne(id: string, executor?: Executor): Promise<AdminUser | undefined> {
  const { rows } = await query<AdminUser>(sql("get_one"), [id], executor);
  return rows[0];
}

// Every user, ordered by role then id. getAdmins() sorts differently (name DESC, id DESC) so is kept separate rather than folded in as a filter.
export async function list(executor?: Executor): Promise<AdminUser[]> {
  const { rows } = await query<AdminUser>(sql("get_all"), [], executor);
  return rows;
}

export async function getAdmins(executor?: Executor): Promise<AdminUser[]> {
  const { rows } = await query<AdminUser>(sql("get_admins"), [], executor);
  return rows;
}

// ---- writes: auth.users.dorado_funds ---------------------------------------
// THE ONE WRITE, kept out of transactions so only one place ever writes this
// table. RETURNS THE ROW, not a row count: `undefined` is what tells "no such
// user" apart from "applied", and the balance in it is what the caller
// displays instead of computing it.
export type CreditRow = { id: string; dorado_funds: number | null };

export async function adjustCredit(
  user_id: string, mode: CreditOp, amount: number, executor?: Executor
): Promise<CreditRow | undefined> {
  const { rows } = await query<CreditRow>(
    sql("adjust_credit"), [amount, mode, user_id], executor
  );
  return rows[0];
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

// The balance without a lock - what the quote surface prices against. Same
// three-way answer as balanceForUpdate: `undefined` is no such user.
export async function balance(
  user_id: string, executor?: Executor
): Promise<number | null | undefined> {
  const { rows } = await query<{ dorado_funds: number | null }>(
    sql("balance"), [user_id], executor
  );
  return rows.length === 0 ? undefined : rows[0].dorado_funds;
}
