// Runs HTTP requests against the real app without leaving anything behind. Without this, a request's controller->service->repo chain takes its connection from the shared pool (no client to hand down), so every write COMMITS.
// Fix: pool.connect()/pool.query() are replaced for the test's duration with ones that always hand back the same client, inside a transaction rolled back at the end. Works only because lint:db enforces one place (the shared executor) to intercept — a repo reaching for its own connection would write straight through this.
// Cannot cover better-auth: it builds its OWN Pool (features/auth/client.ts) and never sees this transaction — a session must be really committed for a guarded endpoint to answer, which is why session.ts commits a user/session but nothing about an order.
// withTransaction still works while pinned: its BEGIN/COMMIT are rewritten to SAVEPOINTs (a nested COMMIT would otherwise end the outer transaction early and defeat the whole thing).
import pool from "#pool";
import { takeLocks } from "#shared/testing/locks.ts";
import { TEST_ACTOR, actingAs } from "#shared/testing/actor.ts";
import type { PoolClient, QueryResult } from "pg";

// The pool is patched in place, which pg's types don't describe — one named cast here rather than scattered anys.
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
      // Releasing the pinned client would return it to the pool mid-test, and the next request would get a different connection outside the transaction — not hypothetical, it's what withTransaction's own finally block would do.
      if (prop === "release") return () => {};
      const value = (target as unknown as Record<string | symbol, unknown>)[prop];
      if (typeof value === "function") return (value as (...a: unknown[]) => unknown).bind(target);
      return value;
    },
  });
}

// `lock` takes an advisory lock first — a pinned transaction holds row locks for the whole request rather than one statement, and API tests run in parallel, so two files writing the same tables without agreeing an order is a deadlock that passes in isolation and hangs in the full run (has happened twice).
// NOT a speed fix — it was briefly mistaken for one; the real slowdown was two files both placing whole orders and both holding the same lock, which is the serialization working as intended.
// Takes a number or array — see locks.ts for what each covers; acquired in ascending order automatically.
// `actor` sets app.actor_id for the audit trigger, because a repo test calls the repo with the pinned client directly and never opens its own transaction (which is normally what sets it) — so without this every row would read as system-authored.
// It's set transaction-local (set_config's 3rd arg) so a pooled connection can't leak it to the next test.
//
// *** IT DEFAULTS TO A REAL PERSON NOW (lane 2). *** It used to default to '',
// so 275 of the suite's 276 pinned calls wrote rows the trigger stamped with
// nobody - twenty-six tables' audit columns exercised as NULL and asserted
// nowhere. shared/testing/actor.ts's TEST_ACTOR is a row the preflight commits
// to the test database once, which is what makes the stamp resolve; pass
// `actor: null` DELIBERATELY for the "a cron sweep is writing" case, and a
// builder-made user's id when the test is about WHO wrote the row.
export async function inPinnedTransaction<T>(
  fn: (client: PoolClient) => Promise<T> | T,
  { lock, actor = TEST_ACTOR.id }: { lock?: number | number[]; actor?: string | null } = {}
): Promise<T> {
  const client = await REAL.connect();
  const pinned = nestable(client);
  depth = 0;

  await client.query("BEGIN");
  await actingAs(client, actor);
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

// Reads committed data on a connection the pin never touches — fixtures (a real user, a real address) exist before the test starts, so they must be read outside the transaction.
// lint:db forbids pool.query directly for good reason; this is the one named exception.
export async function outside<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = await REAL.connect();
  try {
    const { rows } = await client.query(sql, params);
    return rows as T[];
  } finally {
    client.release();
  }
}

// Proves the pin actually works, from outside it — a harness that silently stopped intercepting would still pass every test, since a test reads its own writes either way.
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
