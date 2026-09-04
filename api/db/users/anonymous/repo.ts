// THE ANONYMOUS VISITOR'S LIFECYCLE ON auth.users - and nothing else.
//
// SAME TABLE, DIFFERENT OWNER. `db/users/repo.ts` owns the customer: it reads
// the row and moves the credit balance, and its header says why it has no
// create, no remove and no generic update. A VISITOR is not that row's
// subject. better-auth's anonymous plugin creates them (POST
// /api/auth/sign-in/anonymous), nothing ever updates them, and the sweep
// deletes them - so the three statements here are a lifecycle the customer
// module deliberately does not have, kept beside it rather than inside it.
//
// THE DELETE IS THE ONLY WRITE, and it is the one place in this codebase that
// removes a user row. That is safe for exactly one reason: these rows are not
// customers. A visitor holds no order, no payout, no payment and no ledger
// entry - `place` and the payout step both refuse an anonymous subject
// (domain/checkout/service.ts), so the only things that can point at one are a
// checkout session, an address-book entry and better-auth's own session and
// credential rows. All five go with it, in ONE statement; see sql/delete.sql.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type StaleVisitor = { id: string; last_seen: Date };

// Is this subject a visitor? `undefined` (no such user) answers false: a
// missing user is refused further down by the reads that need one, and
// answering "not anonymous" here would be a claim this statement cannot make.
export async function isAnonymous(user_id: string, executor?: Executor): Promise<boolean> {
  const { rows } = await query<{ is_anonymous: boolean }>(
    sql("is_anonymous"), [user_id], executor
  );
  return rows[0]?.is_anonymous === true;
}

// Visitors whose newest trace - their own row, their newest session, their
// newest basket line - is older than `cutoff`.
export async function listStale(
  cutoff: Date, limit: number, executor?: Executor
): Promise<StaleVisitor[]> {
  const { rows } = await query<StaleVisitor>(
    sql("list_stale"), [cutoff, limit], executor
  );
  return rows;
}

// Deletes the named visitors and everything that points at them. Answers the
// ids actually removed: an id that is NOT anonymous is silently skipped by the
// statement's own WHERE, so the answer is the audit of what happened rather
// than a count that could mean anything.
export async function remove(
  user_ids: string[], executor?: Executor
): Promise<string[]> {
  if (user_ids.length === 0) return [];
  const { rows } = await query<{ id: string }>(sql("delete"), [user_ids], executor);
  return rows.map((r) => r.id);
}
