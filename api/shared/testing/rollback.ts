import pool from "#pool";
import { takeLocks } from "#shared/testing/locks.ts";
import { TEST_ACTOR, actingAs } from "#shared/testing/actor.ts";
import type { PoolClient } from "pg";

export type RollbackOptions = {
  lock?: number | number[];
  actor?: string | null;
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

export function rollbackIn(defaults: RollbackOptions) {
  return <T>(
    fn: (c: PoolClient) => Promise<T> | T, overrides: RollbackOptions = {}
  ): Promise<T> => inRollback(fn, { ...defaults, ...overrides });
}
