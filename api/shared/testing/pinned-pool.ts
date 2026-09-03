// Runs HTTP requests against the real app without leaving anything behind.
//
// THERE WAS A `pinned-pool.d.ts` BESIDE THIS FILE AND IT IS GONE (2026-08-29).
// It was written when this harness was JavaScript, so that `.test.ts` files
// could get real types without converting it. This file is TypeScript now, and
// a `.ts` shadows a `.d.ts` of the same name - so tsc had stopped reading the
// declaration entirely while the declaration went on drifting from the code.
// It had `assertNothingEscaped` returning `Promise<void>`; the implementation
// returns a COUNT. A hand-written type that nothing checks and nothing reads is
// not documentation, it is a second source of truth that cannot be wrong out
// loud. The exported signatures here are now the only ones.
//
// THE PROBLEM. Every repo test here runs inside a transaction that is rolled
// back, because it holds the client and passes it down. A request through
// supertest cannot do that: the controller calls the service, the service calls
// the repo, and the repo takes its connection from the shared pool. Nothing in
// that chain has a client to hand it, so every write COMMITS - and dev fills up
// with orders nobody placed.
//
// THE FIX. Pin the pool. `pool.connect()` and `pool.query()` are replaced for
// the duration of a test with ones that always hand back the same client, and
// that client is inside a transaction that gets rolled back at the end. Every
// query the request makes lands in it and none of them survives.
//
// This works precisely BECAUSE of the rule lint:db enforces. "Every query goes
// through the shared executor, never pool.query directly" is what guarantees
// there is exactly one place to intercept. A single repo reaching for its own
// connection would write straight through this and nobody would notice.
//
// WHAT IT CANNOT COVER, and this is the important limit rather than a caveat:
// better-auth builds its OWN Pool in features/auth/client.js, so it never sees
// this transaction. A session has to be really committed for a guarded endpoint
// to answer. That is what shared/testing/session.js is for, and why the one
// piece of committed data in these tests is a user and a session rather than
// anything about an order.
//
// withTransaction still works. It calls pool.connect(), gets the pinned client,
// and issues BEGIN inside an open transaction - which Postgres warns about and
// ignores. So its COMMIT would end the outer transaction early and defeat the
// whole arrangement. Both are rewritten to SAVEPOINTs while pinned: a nested
// commit releases a savepoint, a nested rollback rolls back to it, and the
// outer transaction is still there to be discarded at the end.
import pool from "#db";
import { takeLocks } from "#shared/testing/locks.ts";
import type { PoolClient, QueryResult } from "pg";

// The pool is patched in place, which its types do not describe - the whole
// point of this file is doing something pg's surface does not offer. One cast,
// named here, rather than scattered anys.
const patchable = pool as unknown as {
  connect: () => Promise<PoolClient>;
  query: (sql: unknown, params?: unknown[]) => Promise<QueryResult>;
};

const REAL = {
  connect: pool.connect.bind(pool),
  query: pool.query.bind(pool),
};

let depth = 0;

// A client that answers BEGIN/COMMIT/ROLLBACK with savepoints instead, so code
// written to open its own transaction still nests correctly.
function nestable(client: PoolClient): PoolClient {
  const realQuery = client.query.bind(client);

  return new Proxy(client, {
    get(target: PoolClient, prop: string | symbol) {
      if (prop === "query") {
        return async (sql: unknown, params?: unknown[]) => {
          const text = typeof sql === "string" ? sql.trim().toUpperCase() : "";

          if (text === "BEGIN") {
            depth += 1;
            return realQuery(`SAVEPOINT nested_${depth}`);
          }
          if (text === "COMMIT") {
            const at = depth;
            depth = Math.max(0, depth - 1);
            return realQuery(`RELEASE SAVEPOINT nested_${at}`);
          }
          if (text === "ROLLBACK") {
            const at = depth;
            depth = Math.max(0, depth - 1);
            return realQuery(`ROLLBACK TO SAVEPOINT nested_${at}`);
          }
          return realQuery(sql as never, params as never);
        };
      }
      // Releasing the pinned client would return it to the pool mid-test and
      // the next request would get a different connection outside the
      // transaction. withTransaction always releases in a finally block, so
      // this is not hypothetical - it is what happens on the first request.
      if (prop === "release") return () => {};
      const value = (target as unknown as Record<string | symbol, unknown>)[prop];
      if (typeof value === "function") return (value as (...a: unknown[]) => unknown).bind(target);
      return value;
    },
  });
}

// Runs fn with every pooled query pinned to one rolled-back transaction.
//
// `lock` takes an advisory lock first, and a replay test that writes wants one.
// A pinned transaction is held open for the whole of a request rather than for
// a single statement, so it holds row locks far longer than a repo test does,
// and the API tests run in parallel. Two files writing the same tables without
// agreeing an order is the deadlock that passes in isolation and hangs in the
// full run, which has already happened twice in this codebase.
//
// It is NOT a speed fix, and it was briefly mistaken for one. The orders tests
// slowed from 2 seconds to 12 when features/orders/parity.test.js arrived, and
// adding a lock here changed nothing - that contention is between
// parity.test.js and create.test.js, which both hold 4213 and both place whole
// orders. The serialisation is the lock working, not failing.
//
// Takes a number or an array. The numbers and what each covers live in
// shared/testing/locks.js; a file touching two groups passes both, and they are
// acquired in ascending order for it.
//
// `actor` IS WHO THE DATABASE THINKS IS WRITING, and it is here for the same
// reason the lock is: the pinned transaction is opened by this function, so
// this is the only place that can put anything on it. withTransaction sets
// `app.actor_id` from the ambient request actor - but a repo test calls the
// repo with the pinned client directly and never opens a transaction of its
// own, so without this the audit trigger would see no actor and every row a
// repo test writes would read as system-authored. Pass the seeded admin's id
// to assert on created_by_id / updated_by_id.
//
// It is transaction-local (set_config's third argument), so it dies with the
// rollback exactly as every other effect of the test does.
export async function inPinnedTransaction<T>(
  fn: (client: PoolClient) => Promise<T> | T,
  { lock, actor }: { lock?: number | number[]; actor?: string | null } = {}
): Promise<T> {
  const client = await REAL.connect();
  const pinned = nestable(client);
  depth = 0;

  await client.query("BEGIN");
  await client.query("SELECT set_config('app.actor_id', $1, true)", [actor ?? ""]);
  if (lock) await takeLocks(client, lock);
  patchable.connect = async () => pinned;
  patchable.query = (sql, params) => pinned.query(sql as never, params as never);

  try {
    return await fn(pinned);
  } finally {
    patchable.connect = REAL.connect;
    patchable.query = REAL.query;
    await client.query("ROLLBACK");
    client.release();
  }
}

// Reads committed data on a connection the pin never touches.
//
// A replay test needs a real user and a real address before it can pretend to
// be anybody, and those have to be read outside the transaction - they are
// fixtures, not something the test wrote. lint:db forbids pool.query for good
// reason, so this is the one place that reaches past it, named so it is obvious
// when it is being used.
export async function outside<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = await REAL.connect();
  try {
    const { rows } = await client.query(sql, params);
    return rows as T[];
  } finally {
    client.release();
  }
}

// Proves the pin is actually in place, from the outside. A harness that
// silently stopped intercepting would let every test in the file commit, and
// the tests themselves would keep passing - they would be reading their own
// writes either way.
export async function assertNothingEscaped(
  table: string, predicate: string, params: unknown[] = []
): Promise<number> {
  const outside = await REAL.connect();
  try {
    const { rows } = await outside.query(
      `SELECT count(*)::int AS n FROM ${table} WHERE ${predicate}`,
      params
    );
    return rows[0].n;
  } finally {
    outside.release();
  }
}
