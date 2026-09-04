// ONE BEGIN/ROLLBACK HELPER, IMPORTED - NOT REWRITTEN IN EVERY FILE.
//
// *** WHAT IT REPLACES. *** 47 test files each declared their own
// `inRollback`, 263 lines of the same four statements, and they had DRIFTED:
// some took an advisory lock, some did not; some reused one client for the
// whole file, some connected per call; none set an actor, so every write they
// made was stamped by nobody (see actor.ts). A helper copied 47 times is 47
// places for the next fix to be applied 46 times.
//
// *** HOW IT DIFFERS FROM inPinnedTransaction, AND WHEN TO USE WHICH. ***
// This one does NOT patch the pool. It opens a transaction, hands the client
// over, and rolls back - so anything it calls must be GIVEN that client. That
// is the repo-test shape: one table, called directly, executor passed
// explicitly. `inPinnedTransaction` is for anything that opens its OWN
// connection behind your back - a service, or a request through the app - and
// pins the pool so that connection is this one.
//
// The client is taken from the pool per call and released after, rather than
// held for the file: a rolled-back transaction leaves the connection clean, so
// there is nothing to gain from keeping it, and a per-call checkout means a
// file's `beforeAll`/`afterAll` no longer has to own one.
import pool from "#pool";
import { takeLocks } from "#shared/testing/locks.ts";
import { TEST_ACTOR, actingAs } from "#shared/testing/actor.ts";
import type { PoolClient } from "pg";

export type RollbackOptions = {
  // Advisory lock ids from locks.ts. Same contract as inPinnedTransaction's:
  // acquired in ascending order, released at ROLLBACK.
  lock?: number | number[];
  // Who the audit trigger records. Defaults to the seeded test actor; pass
  // null deliberately for the "nobody is signed in" case.
  actor?: string | null;
  // An already-checked-out client, for a file that also needs one outside a
  // transaction. Not released here - the caller owns it.
  client?: PoolClient;
};

export async function inRollback<T>(
  fn: (c: PoolClient) => Promise<T> | T,
  { lock, actor = TEST_ACTOR.id, client }: RollbackOptions = {}
): Promise<T> {
  const c = client ?? (await pool.connect());
  await c.query("BEGIN");
  try {
    await actingAs(c, actor);
    if (lock) await takeLocks(c, lock);
    return await fn(c);
  } finally {
    await c.query("ROLLBACK");
    if (!client) c.release();
  }
}

// A FILE'S DEFAULTS, BOUND ONCE.
//
// The lock a test needs is a property of what the FILE writes, not of one
// call - which is exactly how the 45 hand-written copies expressed it, by
// taking the lock inside their own helper. This keeps that, without keeping 45
// implementations: `const inRollback = rollbackIn({ lock: LOCKS.ORDERS })` at
// the top of a file both states the fact once and applies it to every test
// added afterwards, which is what stops a new one arriving unlocked.
//
// A single call can still override - `inRollback(fn, { actor: null })` - and
// the overrides win.
export function rollbackIn(defaults: RollbackOptions) {
  return <T>(
    fn: (c: PoolClient) => Promise<T> | T, overrides: RollbackOptions = {}
  ): Promise<T> => inRollback(fn, { ...defaults, ...overrides });
}
