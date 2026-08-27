// Types for the pinned-pool test harness.
//
// Declared rather than converted, for the same reason query.d.ts is: the
// JavaScript tests keep working untouched while TypeScript ones get real types.
//
// This became necessary the moment tests moved to .ts under the per-table
// feature structure - a .test.ts file IS typechecked, so an untyped helper
// makes every `client` in every endpoint test an implicit any, and tsc refuses.
import type { PoolClient, QueryResultRow } from "pg";

/**
 * Runs `fn` with the pool pinned to a single transaction that is rolled back
 * afterwards, so nothing a test writes survives - including writes made by
 * code under test that opens its own transaction, which becomes a savepoint.
 */
export function inPinnedTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  options?: { lock?: string }
): Promise<T>;

/** Runs a statement OUTSIDE the pinned transaction, on a separate connection. */
export function outside<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<T[]>;

/** Fails if any row matching the predicate survived the rolled-back transaction. */
export function assertNothingEscaped(
  table: string,
  predicate: string,
  params?: unknown[]
): Promise<void>;
