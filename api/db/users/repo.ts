// The users feature's tables: it READS auth.users and WRITES exchange.users.
//
// *** THAT SPLIT LOOKS BACKWARDS AND IS CORRECT. READ THIS BEFORE CHANGING IT. ***
//
// better-auth is configured with `modelName: 'exchange.users'` and writes
// through its OWN pg Pool - not #db, not the shared executor, not any repo. So
// signups, profile edits, verification, bans and the Stripe customer id all
// land in exchange.users without passing through a line of this application.
// Migration 056 puts an AFTER INSERT OR UPDATE trigger on that table which
// copies the whole row into auth.users, so:
//
//   exchange.users  is the SOURCE      (better-auth writes it; we write the balance)
//   auth.users      is the MIRROR      (Postgres maintains it; we read it)
//
// Every other feature on this project has that the other way round. This one is
// inverted because the writer is a library we do not call.
//
// WHY THE BALANCE IS NOT WRITTEN TO auth.users, measured rather than assumed
// (docs/waves/seams.md, seam 2). The trigger's ON CONFLICT DO UPDATE sets
// `dorado_funds = EXCLUDED.dorado_funds` from exchange's row, so a balance
// written only to auth.users is REVERTED by the next better-auth update of that
// user - for any reason, silently, with no error. A $1000 credit vanished on an
// `updatedAt` touch in a rolled-back transaction. Writing BOTH is worse still:
// the trigger applies our exchange write a second time, which is how a $25
// credit once moved a balance $50 (replay.test.ts).
//
// So there is exactly one write per balance, it goes to exchange.users, and the
// trigger carries it to the copy the reads below serve. Reversing the direction
// is the auth cutover - re-pointing better-auth - and that is Jacob's.
//
// NO CREATE, REMOVE, OR GENERIC UPDATE FOR A USER. Everything about a user
// except the credit balance is better-auth's, and the balance is not a bare
// patch either - CRUD-ifying it (Jacob's ruling) carries a named EXCEPTION for
// exactly this table: the write is a ledger operation with FOR UPDATE
// semantics, so `adjustCredit` is the one write this feature keeps, built on
// `balanceForUpdate`'s locked read. `addFunds`/`removeFunds` used to be two
// more statements doing exactly what adjustCredit's own "add"/"subtract" arms
// do; they are gone, and domain/users/service.ts's addFunds/removeFunds now
// call adjustCredit instead of carrying their own SQL.
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

// ---- reads: auth.users -----------------------------------------------------

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

// ---- writes: exchange.users.dorado_funds -----------------------------------
//
// THE ONE WRITE, NOT IN transactions. It used to sit in features/transactions,
// which meant two services wrote the same table - the one thing the
// structure's guardrail forbids, because it is what makes "where does this get
// written?" unanswerable and closes the door on ever putting the invariant in
// one place.
//
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
