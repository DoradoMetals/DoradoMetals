import type { PoolClient, QueryResult, QueryResultRow } from "pg";

/**
 * Runs a statement, on the given client if one is supplied and on the pool
 * otherwise. Passing the client is how a repo call joins its caller's
 * transaction.
 *
 * Declared here rather than converted, so that JavaScript repos keep working
 * unchanged while TypeScript ones get a real row type:
 *
 *   const { rows } = await query<LeadRow>(sql, [id], client);
 */
export default function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: readonly unknown[],
  client?: PoolClient
): Promise<QueryResult<T>>;
