import pool from "#db";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

/**
 * Runs a statement, on the given client if one is supplied and on the pool
 * otherwise. Passing the client is how a repo call joins its caller's
 * transaction:
 *
 *   const { rows } = await query<LeadRow>(sql, [id], client);
 */
export default async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
  client?: PoolClient
): Promise<QueryResult<T>> {
  // pg's own types want a mutable array; it never mutates the values, and the
  // readonly signature is what lets call sites pass `as const` tuples.
  const values = params as unknown[];
  if (client) return client.query<T>(sql, values);
  return pool.query<T>(sql, values);
}
