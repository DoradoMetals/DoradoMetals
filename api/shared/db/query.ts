import pool from "#pool";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { isTestRun } from "#shared/testing/is-test-run.ts";

/**
 * Runs a statement, on the given client if one is supplied and on the pool
 * otherwise. Passing the client is how a repo call joins its caller's
 * transaction:
 *
 *   const { rows } = await query<Lead>(sql, [id], client);
 */
export default async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
  client?: PoolClient
): Promise<QueryResult<T>> {
  // pg's own types want a mutable array; it never mutates the values, and the
  // readonly signature is what lets call sites pass `as const` tuples.
  const values = params as unknown[];

  // Plain `pool.query()` genuinely supports concurrency - each call checks
  // out its own connection - so only an explicitly shared client can ever
  // have two statements racing on the SAME physical connection. That is a
  // real bug (a Promise.all, or two unawaited calls, fanning out over one
  // transaction client): pg queues the second statement and only warns
  // today ("client.query() while already executing"), and turns it into a
  // thrown error in pg@9. Caught here, in test runs, so it fails the test
  // that introduced it instead of surfacing as a warning nobody reads.
  if (client && isTestRun()) return await guarded(client, sql, values);

  if (client) return client.query<T>(sql, values);
  return pool.query<T>(sql, values);
}

// The SQL of whichever statement is currently in flight on a given client,
// keyed by the client itself so unrelated clients never interfere.
const inFlight = new WeakMap<PoolClient, string>();

async function guarded<T extends QueryResultRow = QueryResultRow>(
  client: PoolClient, sql: string, values: unknown[]
): Promise<QueryResult<T>> {
  const running = inFlight.get(client);
  if (running !== undefined) {
    throw new Error(
      "query() called on a client that is already executing another query - " +
        "two statements racing on one pg connection (a Promise.all, or two " +
        "unawaited calls, sharing one transaction client). Await them " +
        "sequentially, or issue one query that returns everything, instead.\n" +
        `  already executing: ${running}\n` +
        `  just issued:        ${sql}`
    );
  }
  inFlight.set(client, sql);
  try {
    return await client.query<T>(sql, values);
  } finally {
    inFlight.delete(client);
  }
}
