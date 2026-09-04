import pool from "#pool";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { isTestRun } from "#shared/testing/is-test-run.ts";

export default async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
  client?: PoolClient
): Promise<QueryResult<T>> {
  const values = params as unknown[];

  if (client && isTestRun()) return await guarded(client, sql, values);

  if (client) return client.query<T>(sql, values);
  return pool.query<T>(sql, values);
}

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
