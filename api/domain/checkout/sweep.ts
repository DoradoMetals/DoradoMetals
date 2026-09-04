import { anonymousUsers } from "#db";
import withTransaction from "#shared/db/withTransaction.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { VisitorSweepResult } from "@dorado/contracts";

export const STALE_AFTER_DAYS = 7;

export const BATCH = 5_000;

export async function sweepAnonymousVisitors(
  options: { days?: number; limit?: number; now?: Date } = {},
  executor?: Executor
): Promise<VisitorSweepResult> {
  const days = options.days ?? STALE_AFTER_DAYS;
  const limit = options.limit ?? BATCH;
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const run = async (client: Executor): Promise<VisitorSweepResult> => {
    const stale = await anonymousUsers.listStale(cutoff, limit, client);
    if (stale.length === 0) return { considered: 0, deleted: [] };
    const deleted = await anonymousUsers.remove(stale.map((v) => v.id), client);
    return { considered: stale.length, deleted };
  };

  return executor ? await run(executor) : await withTransaction(run);
}
