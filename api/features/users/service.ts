import * as users from "#features/users/repo.ts";
import * as legacy from "#legacy/users/repo.ts";
import withTransaction from "#shared/db/withTransaction.js";
import type { UserRow } from "#features/users/repo.ts";
import type { PoolClient } from "pg";

// The controller's error handler reads statusCode off the thrown error, so it
// is declared rather than assigned onto a bare Error.
interface HttpError extends Error {
  statusCode?: number;
}

export async function getUser(id: string): Promise<UserRow | undefined> {
  return await users.getOne(id);
}

export async function getAllUsers(): Promise<UserRow[]> {
  return await users.getAll();
}

export async function getAdminUsers(): Promise<UserRow[]> {
  return await users.getAdmins();
}

// THE MODES ARE AN ALLOWLIST, AND `amount` HAS TO BE A NUMBER.
//
// The repo builds the new balance with a CASE that has no ELSE:
//
//   SET dorado_funds = CASE WHEN $2 = 'add' ... WHEN $2 = 'subtract' ...
//                           WHEN $2 = 'edit' ... END
//
// A CASE that matches nothing yields NULL, so before this an unrecognised mode
// assigned NULL to a customer's credit balance. `mode` comes straight from
// req.body, so a typo, a renamed frontend constant or a stale client was enough.
//
// It never actually lost anyone's money, and it is worth being precise about
// why: exchange.users.dorado_funds is NOT NULL, so the database refused the
// write. THE CONSTRAINT WAS DOING THIS JOB, not the code - and auth.users,
// where this write goes after promotion, had no such constraint. Migration 080
// adds it, so the guarantee survives. This is the half that does not depend on
// a constraint existing at all.
//
// An allowlist rather than a check for known-bad values: the failure mode being
// prevented is an UNRECOGNISED mode, so a denylist could not have caught it.
const CREDIT_MODES = new Set(["add", "subtract", "edit"]);

// THE OPERATION IS NAMED `op`, AND `mode` IS THE OLD SPELLING (D98).
//
// Ruling 10 - ids in, data out - says the server takes `{op, amount}` and does
// the arithmetic. It always could; what it was actually SENT was `mode: 'edit'`
// with an absolute total the browser had computed from a balance it had
// fetched. Both spellings are accepted while the frontend is re-pointed,
// because this lane may not edit frontend/**; `op` wins when both arrive.
function operationOf(body: { op?: unknown; mode?: unknown }): unknown {
  return body.op !== undefined ? body.op : body.mode;
}

// What each operation makes of a balance. The repo's CASE does this in SQL;
// this is the same three arms in JavaScript, used ONLY to decide whether the
// result would be negative - the write itself is still the single statement,
// so nothing here can disagree with what lands.
//
// ROUNDED, BECAUSE POSTGRES AND JAVASCRIPT DO NOT AGREE ON DECIMALS.
// dorado_funds is NUMERIC and Postgres is exact; JavaScript is not, so
// subtracting a balance from itself can leave -1e-16 rather than 0 depending
// on how the two decimals landed in binary. Unrounded, that would refuse a
// customer withdrawing their whole balance - a real operation - on a
// difference eleven orders of magnitude below a cent. Six places is far finer
// than money and far coarser than float error, the same reasoning
// features/users/tests/replay.test.js's `sameMoney` is built on.
function resultOf(op: string, current: number, amount: number): number {
  const raw = op === "add" ? current + amount : op === "subtract" ? current - amount : amount;
  return Number(raw.toFixed(6));
}

// The same shape features/addresses uses: a plain Error carrying a statusCode.
// errorHandler treats a deliberate 4xx as safe to show the caller and returns a
// generic message for everything else, so the text here is written to be read.
function badRequest(message: string): HttpError {
  const err: HttpError = new Error(message);
  err.statusCode = 400;
  return err;
}

function notFound(message: string): HttpError {
  const err: HttpError = new Error(message);
  err.statusCode = 404;
  return err;
}

// 422: the request is well-formed and the caller may make it, but the ledger
// will not hold the result. Distinct from the 400s above, which are malformed
// input, and from the 404, which is a subject that does not exist.
function unprocessable(message: string): HttpError {
  const err: HttpError = new Error(message);
  err.statusCode = 422;
  return err;
}

// `mode` and `amount` are typed as UNKNOWN on the way in, not as the narrow
// types they end up being. They arrive as req.body: claiming `mode: string`
// here would tell a reader the allowlist below is redundant, and claiming
// `amount: number` would delete the reason the Number() coercion exists.
// The checks are what turn them into the narrow types, so the signature
// admits what actually arrives.
export async function adjustDoradoCredit({
  user_id,
  op,
  mode,
  amount,
}: {
  user_id?: string;
  op?: unknown;
  mode?: unknown;
  amount?: unknown;
}): Promise<{ rowCount: number; dorado_funds: number | null }> {
  const operation = operationOf({ op, mode });
  if (typeof operation !== "string" || !CREDIT_MODES.has(operation)) {
    throw badRequest(
      `unknown credit mode ${JSON.stringify(operation)}. Expected one of ${[...CREDIT_MODES].join(", ")}.`
    );
  }

  // NOT `Number(amount)`. That was the first version of this check and it was
  // exactly the bug it was written to prevent: Number(null), Number("") and
  // Number([]) are all 0, and 0 is finite, so an empty amount field passed
  // validation and became a zero adjustment - under `edit`, a zeroed balance,
  // returned as 200. Caught by the suite below, which sends each of them.
  //
  // So the coercion is narrowed to the two things a caller can legitimately
  // send: a real number, or a non-empty string that parses to one. Everything
  // else is refused rather than coerced.
  const value =
    typeof amount === "number"
      ? amount
      : typeof amount === "string" && amount.trim() !== ""
        ? Number(amount)
        : NaN;
  if (!Number.isFinite(value)) {
    throw badRequest(`credit amount ${JSON.stringify(amount)} is not a number`);
  }

  if (!user_id) {
    throw badRequest("a credit adjustment needs a user_id");
  }

  // ONE WRITE, NOT TWO - AND THAT IS THE OPPOSITE OF EVERY OTHER FEATURE.
  //
  // users is the one place a dual write is WRONG, because the database already
  // does it: exchange.users carries an AFTER INSERT OR UPDATE trigger,
  // `mirror_users_to_auth`, running auth.mirror_user_from_exchange(). Writing
  // both by hand applies the adjustment TWICE - a $25 credit moved the balance
  // $50, which replay.test.js caught immediately.
  //
  // So the legacy statement is the only one, and auth.users.dorado_funds is
  // maintained by the trigger. Reads still come from auth.users, so the balance
  // a customer sees is the mirrored one.
  //
  // THIS IS ALSO THE ANSWER TO THE AUTH CUTOVER QUESTION. Trigger-based
  // mirroring already exists and works for users; better-auth writing exchange
  // through its own pool is fine, because the trigger carries it across without
  // better-auth's cooperation. Noted for the report.
  // AND IT ALL HAPPENS UNDER ONE ROW LOCK (D98).
  //
  // The statement itself was already a delta - `COALESCE(dorado_funds, 0) + $1`
  // - so two concurrent ADDs could not lose each other even before this. What
  // could, and what the drawer actually did, is the read-modify-write the
  // BROWSER performed around it: fetch the balance, compute the total, PUT the
  // total as `edit`. Two admins with the drawer open, and the second write
  // discards the first with no error on either side.
  //
  // Taking the row FOR UPDATE first closes the remaining window - the floor
  // check below is itself a read-then-write, and an unguarded one would let two
  // subtractions each pass a check only one of them can honour. Everything in
  // here is database work, so a transaction is the right tool (CLAUDE.md's rule
  // is about irreversible side effects, and there are none).
  const result = await withTransaction(async (client: PoolClient) => {
    const current = await legacy.balanceForUpdate(user_id, client);
    if (current === undefined) {
      throw notFound(
        `no user ${user_id} - the credit adjustment was not applied to anybody`
      );
    }

    // THE FLOOR WAS ONLY EVER CHECKED IN THE BROWSER. UsersDrawer refuses to
    // submit a subtraction that would go below zero and a negative `edit`;
    // nothing on the server did, so any other caller could drive a customer's
    // balance negative. The column is NOT NULL and has no CHECK, so the
    // database would have taken it.
    const next = resultOf(operation, Number(current ?? 0), value);
    if (next < 0) {
      throw unprocessable(
        `that would leave a balance of ${next.toFixed(2)}; a credit balance cannot go below zero`
      );
    }

    return await legacy.adjustCredit(
      user_id, operation as users.CreditMode, value, client
    );
  });

  // A CREDIT NOBODY RECEIVED USED TO ANSWER 200.
  //
  // The UPDATE is `WHERE id = $3`. A user_id matching no row updates nothing,
  // returns rowCount 0, and the controller answers 200 with it - so an admin
  // adding $500 to an account that does not exist is told it worked. Measured:
  // a random uuid comes back rowCount 0 and 200.
  //
  // The frontend cannot reach it today, because it sends an id from a list it
  // has just fetched. That is not the same as it being unreachable: a user
  // deleted between the fetch and the adjustment lands here, and so does any
  // direct call. Reporting success for money that moved nowhere is the wrong
  // answer in both cases.
  if (result.rowCount === 0) {
    throw notFound(
      `no user ${user_id} - the credit adjustment was not applied to anybody`
    );
  }

  return result;
}

// The balance movements that accompany an order. Called from inside the
// transaction that creates or completes it, so they take the caller's executor -
// funds that move for an order which rolls back must roll back with it.
// user_id and total are NULLABLE at the call site, because the order they come
// from declares them so on the wire. A movement with no user or no amount is a
// no-op rather than a crash or a NULL arithmetic result - `dorado_funds + NULL`
// is NULL, and the column is NOT NULL, so the statement would have raised 23502
// after the caller had already committed other work.
export async function addFunds(
  user_id: string | null, total: number | null, executor?: unknown
): Promise<number> {
  if (!user_id || total === null) return 0;
  return await users.addFunds(user_id, total, executor as never);
}

export async function removeFunds(
  user_id: string | null, total: number | null, executor?: unknown
): Promise<number> {
  if (!user_id || total === null) return 0;
  return await users.removeFunds(user_id, total, executor as never);
}
