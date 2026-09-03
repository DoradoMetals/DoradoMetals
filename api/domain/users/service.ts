import * as users from "#db/users/repo.ts";
import * as transactionsService from "#domain/transactions/service.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import type { CreditRow, UserRow } from "#db/users/repo.ts";
import type { PoolClient } from "pg";
import type { Executor } from "#shared/db/executor.ts";

// The controller's error handler reads statusCode off the thrown error, so it
// is declared rather than assigned onto a bare Error.
interface HttpError extends Error {
  statusCode?: number;
}

export async function getUser(id: string): Promise<UserRow | undefined> {
  return await users.getOne(id);
}

export async function getAllUsers(): Promise<UserRow[]> {
  return await users.list();
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
// why: the column is NOT NULL, so the database refused the write. THE
// CONSTRAINT WAS DOING THIS JOB, not the code - and auth.users, where the write
// lands since migration 118, had no such constraint until 080 added it in
// anticipation. This allowlist is the half that does not depend on a constraint
// existing at all.
//
// An allowlist rather than a check for known-bad values: the failure mode being
// prevented is an UNRECOGNISED mode, so a denylist could not have caught it.
const CREDIT_MODES = new Set(["add", "subtract", "edit"]);

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

// WHAT THE LEDGER RECORDS, DERIVED FROM THE TWO BALANCES RATHER THAN THE
// REQUEST. `add` and `subtract` name their own direction, but `edit` does not -
// an edit to a smaller number is a debit and to a larger one a credit - and
// payments.ledger.amount carries a CHECK (amount >= 0), so a signed delta could
// not be stored even if the request had offered one. Reading the movement off
// (before, after) means the three modes collapse to one rule and the row can
// never disagree with the balance it explains.
function movementOf(before: number, after: number): { type: string; amount: number } | null {
  const delta = Number((after - before).toFixed(6));
  if (delta === 0) return null;
  return delta > 0
    ? { type: "Credit", amount: delta }
    : { type: "Debit", amount: -delta };
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

// `op` and `amount` are typed as UNKNOWN on the way in, not as the narrow types
// they end up being. They arrive as req.body: claiming `op: string` here would
// tell a reader the allowlist below is redundant, and claiming `amount: number`
// would delete the reason the Number() coercion exists. The checks are what
// turn them into the narrow types, so the signature admits what actually
// arrives.
//
// `mode` IS GONE. It was the pre-D98 spelling, kept alive only so the frontend
// could be re-pointed in its own time; shapes are no longer being preserved on
// this branch (Jacob, 2026-09-03), so there is one spelling again.
export async function adjustDoradoCredit({
  user_id,
  op,
  amount,
}: {
  user_id?: string;
  op?: unknown;
  amount?: unknown;
}): Promise<CreditRow> {
  if (typeof op !== "string" || !CREDIT_MODES.has(op)) {
    throw badRequest(
      `unknown credit mode ${JSON.stringify(op)}. Expected one of ${[...CREDIT_MODES].join(", ")}.`
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

  // ONE WRITE, AND SINCE MIGRATION 118 IT GOES WHERE THE READS COME FROM.
  //
  // This used to be the one place a dual write was WRONG, because the database
  // did it: exchange.users carried an AFTER UPDATE trigger copying the balance
  // into auth.users, so writing both applied the adjustment twice and a $25
  // credit moved a balance $50 (replay.test.ts caught it immediately). 118
  // retires that mirror; the write and the read are now the same table, so
  // there is nothing left to double.
  //
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
  // subtractions each pass a check only one of them can honour. The ledger row
  // is written inside the same transaction, so a movement and its record commit
  // together or neither does. Everything in here is database work, so a
  // transaction is the right tool (CLAUDE.md's rule is about irreversible side
  // effects, and there are none).
  const result = await withTransaction(async (client: PoolClient) => {
    const current = await users.balanceForUpdate(user_id, client);
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
    const before = Number(current ?? 0);
    const next = resultOf(op, before, value);
    if (next < 0) {
      throw unprocessable(
        `that would leave a balance of ${next.toFixed(2)}; a credit balance cannot go below zero`
      );
    }

    const row = await users.adjustCredit(user_id, op as users.CreditMode, value, client);

    // A CREDIT NOBODY RECEIVED USED TO ANSWER 200. The UPDATE is `WHERE id =
    // $3`; a user_id matching no row updated nothing and the controller
    // answered 200 with it, so an admin adding $500 to an account that does not
    // exist was told it worked. The locked read above already refuses that, and
    // this is the backstop for the window between them.
    if (!row) {
      throw notFound(
        `no user ${user_id} - the credit adjustment was not applied to anybody`
      );
    }

    // AN ADMIN EDIT IS A MOVEMENT AND MOVEMENTS ARE LEDGERED. Every other way a
    // balance moves - an order crediting a payout, a sale reserving credit, an
    // abandonment sweep putting it back - writes a payments.ledger row at its
    // call site, with the order id that explains it. This path wrote none at
    // all, so the manual adjustments were the one class of movement the ledger
    // could not account for. `order_id` is null because there is no order: the
    // subject is a person, not a purchase.
    const movement = movementOf(before, Number(row.dorado_funds ?? 0));
    if (movement) {
      await transactionsService.addTransactionLog(
        user_id, movement.type, null, null, movement.amount, client
      );
    }

    return row;
  });

  return result;
}

// The balance the quote surface prices against. It reads the customer's own
// row rather than believing a number in a request body - a caller declaring
// their own balance would be declaring their own discount - and answers
// `undefined` for a subject with no user row, which the caller reports as 401
// rather than pricing as zero.
export async function getBalance(user_id: string): Promise<number | null | undefined> {
  return await users.balance(user_id);
}

// The balance movements that accompany an order. Called from inside the
// transaction that creates or completes it, so they take the caller's executor -
// funds that move for an order which rolls back must roll back with it.
// user_id and total are NULLABLE at the call site, because the order they come
// from declares them so on the wire. A movement with no user or no amount is a
// no-op rather than a crash or a NULL arithmetic result - `dorado_funds + NULL`
// is NULL, and the column is NOT NULL, so the statement would have raised 23502
// after the caller had already committed other work.
// Built on the same repo primitive adjustDoradoCredit uses above
// (adjustCredit's "add"/"subtract" arms) rather than two more one-column
// statements - a checkout money movement and an admin's manual edit are the
// same write, and the CASE-with-no-ELSE backstop covers both this way instead
// of once.
//
// THEY DO NOT LEDGER, AND ADJUSTDORADOCREDIT DOES. Every caller of these
// already writes its own payments.ledger row, because only the caller knows
// which order the movement belongs to - dropping that here and ledgering
// centrally instead would either duplicate every existing row or throw away the
// order id that makes it legible. The admin edit has no order, which is exactly
// why it can ledger for itself.
export async function addFunds(
  user_id: string | null, total: number | null, executor?: Executor
): Promise<CreditRow | undefined> {
  if (!user_id || total === null) return undefined;
  return await users.adjustCredit(user_id, "add", total, executor);
}

export async function removeFunds(
  user_id: string | null, total: number | null, executor?: Executor
): Promise<CreditRow | undefined> {
  if (!user_id || total === null) return undefined;
  return await users.adjustCredit(user_id, "subtract", total, executor);
}
