import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export async function isAnonymous(user_id: string, executor?: Executor): Promise<boolean> {
  const { rows } = await query<{ is_anonymous: boolean }>(
    sql("is_anonymous"), [user_id], executor
  );
  return rows[0]?.is_anonymous === true;
}

export async function listStale(
  cutoff: Date, limit: number, executor?: Executor
): Promise<{ id: string; last_seen: Date }[]> {
  const { rows } = await query<{ id: string; last_seen: Date }>(
    sql("list_stale"), [cutoff, limit], executor
  );
  return rows;
}

export async function remove(
  user_ids: string[], executor?: Executor
): Promise<string[]> {
  if (user_ids.length === 0) return [];
  const { rows } = await query<{ id: string }>(sql("delete"), [user_ids], executor);
  return rows.map((r) => r.id);
}
