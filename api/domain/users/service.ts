import * as users from "#db/users/repo.ts";
import * as transactionsService from "#domain/transactions/service.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import type { CreditRow, UserRow } from "#db/users/repo.ts";
import type { PoolClient } from "pg";
import type { Executor } from "#shared/db/executor.ts";

// The controller's error handler reads statusCode off the thrown error.
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

// An allowlist, not a denylist: the repo's CASE has no ELSE, so an
// unrecognised mode would assign NULL to a balance - the NOT NULL constraint
// refuses it, not this code, and a denylist can't catch an unrecognised
// value.
const CREDIT_MODES = new Set(["add", "subtract", "edit"]);

// Mirrors the repo's SQL CASE in JavaScript, used only to check whether the
// result would go negative - the write itself is still the one statement.
// Rounded to 6 places: NUMERIC is exact and JS floats aren't, so a balance
// minus itself can land on -1e-16 rather than 0 and wrongly refuse a full
// withdrawal.
function resultOf(op: string, current: number, amount: number): number {
  const raw = op === "add" ? current + amount : op === "subtract" ? current - amount : amount;
  return Number(raw.toFixed(6));
}

// WHAT THE LEDGER RECORDS, derived from the two balances rather than the
// request: `edit` does not name its own direction, and payments.ledger.amount
// carries a CHECK (amount >= 0), so a signed delta could not be stored anyway.
function movementOf(before: number, after: number): { type: string; amount: number } | null {
  const delta = Number((after - before).toFixed(6));
  if (delta === 0) return null;
  return delta > 0
    ? { type: "Credit", amount: delta }
    : { type: "Debit", amount: -delta };
}

// A plain Error carrying a statusCode. errorHandler shows a deliberate 4xx to
// the caller and a generic message for everything else, so this text is
// written to be read.
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

// 422: well-formed and permitted, but the ledger won't hold the result - distinct from the 400s (malformed input) and the 404 (no such subject).
function unprocessable(message: string): HttpError {
  const err: HttpError = new Error(message);
  err.statusCode = 422;
  return err;
}

// `op` and `amount` are typed as UNKNOWN on the way in, not as the narrow
// types they end up being - claiming a narrower type here would hide why the
// allowlist and Number() coercion below exist.
// `mode` IS GONE: shapes are no longer being preserved on this branch, so
// there is one spelling again.
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

  // NOT `Number(amount)`: Number(null), Number("") and Number([]) are all 0 and finite, so an empty field would pass validation as a zero adjustment (a zeroed balance under `edit`). Only a real number or a non-empty numeric string is accepted.
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

  // ONE WRITE, NOT TWO: migration 118 retired the trigger that mirrored
  // exchange.users into auth.users, so the write and the read are now the
  // same table and there is nothing left to double.
  // Row-locked (FOR UPDATE) to close a lost-update race: the floor check
  // below is a read-then-write, and unguarded, two concurrent subtractions
  // could each pass a check only one should honour. The ledger row is
  // written inside the same transaction, so a movement and its record
  // commit together or neither does.
  const result = await withTransaction(async (client: PoolClient) => {
    const current = await users.balanceForUpdate(user_id, client);
    if (current === undefined) {
      throw notFound(
        `no user ${user_id} - the credit adjustment was not applied to anybody`
      );
    }

    // THE FLOOR WAS ONLY EVER CHECKED IN THE BROWSER: nothing on the server
    // did, and the column is NOT NULL with no CHECK, so the database would
    // have taken a negative balance.
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
// row rather than believing a number in a request body, and answers
// `undefined` for a subject with no user row, which the caller reports as
// 401 rather than pricing as zero.
export async function getBalance(user_id: string): Promise<number | null | undefined> {
  return await users.balance(user_id);
}

// The balance movements that accompany an order. Take the caller's executor
// so funds that move for an order which rolls back roll back with it.
// A movement with no user or no amount is a no-op rather than a crash:
// `dorado_funds + NULL` is NULL, and the column is NOT NULL, so the
// statement would raise 23502 after other work already committed.
//
// THEY DO NOT LEDGER, AND ADJUSTDORADOCREDIT DOES: every caller of these
// already writes its own payments.ledger row with the order id that explains
// it, which this function does not have.
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
