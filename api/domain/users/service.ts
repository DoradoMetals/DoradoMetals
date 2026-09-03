import * as users from "#db/users/repo.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import type { UserRow } from "#db/users/repo.ts";
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

// An allowlist, not a denylist: the repo's CASE has no ELSE, so an unrecognised mode would assign NULL to a balance - the NOT NULL constraint refuses it, not this code, and a denylist can't catch an unrecognised value.
const CREDIT_MODES = new Set(["add", "subtract", "edit"]);

// `op` is the current spelling, `mode` the old one - both accepted while the frontend is re-pointed; `op` wins when both arrive.
function operationOf(body: { op?: unknown; mode?: unknown }): unknown {
  return body.op !== undefined ? body.op : body.mode;
}

// Mirrors the repo's SQL CASE in JavaScript, used only to check whether the result would go negative - the write itself is still the one statement.
// Rounded to 6 places: NUMERIC is exact and JS floats aren't, so a balance minus itself can land on -1e-16 rather than 0 and wrongly refuse a full withdrawal.
function resultOf(op: string, current: number, amount: number): number {
  const raw = op === "add" ? current + amount : op === "subtract" ? current - amount : amount;
  return Number(raw.toFixed(6));
}

// A plain Error carrying a statusCode. errorHandler shows a deliberate 4xx to the caller and a generic message for everything else, so this text is written to be read.
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

// `mode`/`amount` are typed unknown on the way in - claiming a narrower type here would hide why the allowlist and Number() coercion below exist.
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

  // ONE WRITE, NOT TWO: exchange.users carries a trigger that mirrors into auth.users, so writing both by hand applies the adjustment TWICE - a $25 credit once moved the balance $50. The write goes to exchange.users (the source); auth.users is read-only here and reverts silently if written directly.
  // Row-locked (FOR UPDATE) to close a lost-update race: the floor check below is a read-then-write, and unguarded, two concurrent subtractions could each pass a check only one should honour.
  const result = await withTransaction(async (client: PoolClient) => {
    const current = await users.balanceForUpdate(user_id, client);
    if (current === undefined) {
      throw notFound(
        `no user ${user_id} - the credit adjustment was not applied to anybody`
      );
    }

    // The floor used to be checked only in the browser - nothing on the server did, and the column has no CHECK constraint, so any other caller could drive a balance negative.
    const next = resultOf(operation, Number(current ?? 0), value);
    if (next < 0) {
      throw unprocessable(
        `that would leave a balance of ${next.toFixed(2)}; a credit balance cannot go below zero`
      );
    }

    return await users.adjustCredit(
      user_id, operation as users.CreditMode, value, client
    );
  });

  // A user_id matching no row updates nothing and used to answer 200 - an admin crediting a since-deleted account was told it worked. rowCount 0 is refused here instead.
  if (result.rowCount === 0) {
    throw notFound(
      `no user ${user_id} - the credit adjustment was not applied to anybody`
    );
  }

  return result;
}

// The balance movements that accompany an order. Take the caller's executor so funds that move for an order which rolls back roll back with it.
// A movement with no user or no amount is a no-op rather than a crash: `dorado_funds + NULL` is NULL, and the column is NOT NULL, so the statement would raise 23502 after other work already committed.
export async function addFunds(
  user_id: string | null, total: number | null, executor?: Executor
): Promise<number> {
  if (!user_id || total === null) return 0;
  return (await users.adjustCredit(user_id, "add", total, executor)).rowCount;
}

export async function removeFunds(
  user_id: string | null, total: number | null, executor?: Executor
): Promise<number> {
  if (!user_id || total === null) return 0;
  return (await users.adjustCredit(user_id, "subtract", total, executor)).rowCount;
}
