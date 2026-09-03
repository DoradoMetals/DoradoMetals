// The users feature's table: auth.users, read and written.
//
// *** IT USED TO BE TWO TABLES, AND THE SPLIT LOOKED BACKWARDS. *** Until
// migration 118 this file READ auth.users and WROTE exchange.users, because
// 056 - and then 107 - made exchange.users the source of the credit balance
// and auth.users a trigger-maintained copy. A balance written auth-side was
// reverted by the next better-auth update of that row, silently, with no error
// raised: a $1000 credit disappeared on an `updatedAt` touch. Writing both was
// worse, because the mirror applied our write a second time and a $25 credit
// moved a balance $50.
//
// 118 retires that mirror, so the inversion is gone: better-auth writes
// auth.users, this feature writes auth.users, and every read below comes from
// the row that was written. `exchange.users.dorado_funds` is frozen at its
// last value - readable forever, fed by nothing - which is ruling 36 applied
// to the last application write exchange still received. The auth -> exchange
// IDENTITY mirror stays, so features joining exchange.users for a name or an
// email keep seeing fresh identity.
//
// NO CREATE, REMOVE, OR GENERIC UPDATE FOR A USER. Everything about a user
// except the credit balance is better-auth's, and the balance is not a bare
// patch either - CRUD-ifying it (Jacob's ruling) carries a named EXCEPTION for
// exactly this table: the write is a ledger operation with FOR UPDATE
// semantics, so `adjustCredit` is the one write this feature keeps, built on
// `balanceForUpdate`'s locked read.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// ONE ROW SHAPE FOR ALL THREE READS. get_one used to omit dorado_funds and
// phone_number while get_all carried the balance, so the type had to declare it
// optional and every caller had to cope with a field that might not be there.
// The three statements project the same columns now, so the shape is
// unconditional.
export type UserRow = {
  id: string; email: string; name: string; phone_number: string | null;
  created_at: Date; updated_at: Date; email_verified: boolean;
  image: string | null; role: string | null;
  dorado_funds: string | number | null;
};

export type CreditMode = "add" | "subtract" | "edit";

// ---- reads -----------------------------------------------------------------

export async function getOne(id: string, executor?: Executor): Promise<UserRow | undefined> {
  const { rows } = await query<UserRow>(sql("get_one"), [id], executor);
  return rows[0];
}

// list(): every user, admin-role rows included, ordered by role then id - the
// full admin roster. getAdmins() is a genuinely different shape, not a filter
// on this one: it sorts name DESC, id DESC (the historical admin-list order -
// see sql/get_admins.sql's own header), so folding it into list({role}) would
// push an ORDER BY choice into a parameter for exactly one caller. Kept
// separate.
export async function list(executor?: Executor): Promise<UserRow[]> {
  const { rows } = await query<UserRow>(sql("get_all"), [], executor);
  return rows;
}

export async function getAdmins(executor?: Executor): Promise<UserRow[]> {
  const { rows } = await query<UserRow>(sql("get_admins"), [], executor);
  return rows;
}

// ---- writes: auth.users.dorado_funds ---------------------------------------
//
// THE ONE WRITE, NOT IN transactions. It used to sit in features/transactions,
// which meant two services wrote the same table - the one thing the
// structure's guardrail forbids, because it is what makes "where does this get
// written?" unanswerable and closes the door on ever putting the invariant in
// one place.
//
// RETURNS THE ROW, not a row count. `undefined` is what tells "no such user"
// apart from "applied", the same distinction balanceForUpdate makes, and the
// balance in it is what the caller displays instead of computing it (D98).
export type CreditRow = { id: string; dorado_funds: number | null };

export async function adjustCredit(
  user_id: string, mode: CreditMode, amount: number, executor?: Executor
): Promise<CreditRow | undefined> {
  const { rows } = await query<CreditRow>(
    sql("adjust_credit"), [amount, mode, user_id], executor
  );
  return rows[0];
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
