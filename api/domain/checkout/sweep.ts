// THE VISITORS NOBODY CAME BACK FOR.
//
// Ruling 63 gives every visitor a real auth.users row on their first basket
// touch, so the site now mints an identity for anyone who so much as adds an
// item - crawlers included. Nothing else deletes them: better-auth's anonymous
// plugin is configured with `disableDeleteAnonymousUser: true`
// (domain/auth/client.ts says why), so the plugin never deletes one during a
// sign-in and this sweep is the only thing that ever does.
//
// IT LIVES IN CHECKOUT, NOT AUTH OR PAYMENTS. The subject is a basket nobody
// is coming back to; the user row is the thing the basket hangs off. The file
// is its own, beside the feature, rather than an addition to
// domain/payments/sweeps.ts - that file's subject is an intent, and its
// abandonment half deliberately stays behind a human because it moves money.
// This one moves none.
//
// SAFE ON A TIMER, which is the same test payments/sweeps.ts applies to its
// settled sweep: it is idempotent, it moves no money, and the rows it deletes
// are device-sync rather than a ledger (CLAUDE.md, "not all data is equally
// precious"). Nothing it can touch is irreplaceable - `place` and the payout
// step both refuse an anonymous subject, so a visitor holds no order, no
// payout and no bank details.
//
// A BOUNDED BATCH PER TICK. The first run against a database that has been
// live for a while could face thousands; the limit keeps one tick from taking
// one enormous lock, and the next tick takes the next batch.
import { anonymousUsers } from "#db";
import withTransaction from "#shared/db/withTransaction.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { VisitorSweepResult } from "@dorado/contracts";

// Seven days (ruling 63). Long enough that a customer who left a tab open over
// a long weekend comes back to their basket; short enough that a crawler's
// identity does not outlive the month.
export const STALE_AFTER_DAYS = 7;

// One tick's worth. Five thousand rows is a fraction of a second of DELETEs and
// still bounds the very first run.
export const BATCH = 5_000;

export async function sweepAnonymousVisitors(
  options: { days?: number; limit?: number; now?: Date } = {},
  executor?: Executor
): Promise<VisitorSweepResult> {
  const days = options.days ?? STALE_AFTER_DAYS;
  const limit = options.limit ?? BATCH;
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const run = async (client: Executor): Promise<VisitorSweepResult> => {
    const stale = await anonymousUsers.listStale(cutoff, limit, client);
    if (stale.length === 0) return { considered: 0, deleted: [] };
    // ONE STATEMENT DELETES THE BATCH AND EVERYTHING POINTING AT IT - see
    // db/users/anonymous/sql/delete.sql. If any row this sweep does not know
    // about references a visitor, that statement raises 23503 and deletes
    // NOTHING, which is the answer we want: a visitor holding something real
    // is a bug to see, not a cascade to run.
    const deleted = await anonymousUsers.remove(stale.map((v) => v.id), client);
    return { considered: stale.length, deleted };
  };

  return executor ? await run(executor) : await withTransaction(run);
}
