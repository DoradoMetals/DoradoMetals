import { anonymousUsers } from '#db'
import withTransaction from '#shared/db/withTransaction.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { VisitorSweepResult } from '@dorado/contracts'

export const STALE_AFTER_DAYS = 7

export const BATCH = 5_000

export async function sweepAnonymousVisitors(
  days: number | null,
  limit: number | null,
  now: Date | null,
  tx: Executor
): Promise<VisitorSweepResult> {
  const at = now ?? new Date()
  const window = days ?? STALE_AFTER_DAYS
  const cutoff = new Date(at.getTime() - window * 24 * 60 * 60 * 1000)

  const stale = await anonymousUsers.listStale(cutoff, limit ?? BATCH, tx)
  if (stale.length === 0) return { considered: 0, deleted: [] }
  const deleted = await anonymousUsers.remove(
    stale.map((v) => v.id),
    tx
  )
  return { considered: stale.length, deleted }
}

export const sweepAnonymousVisitorsNow = (): Promise<VisitorSweepResult> =>
  withTransaction((tx) => sweepAnonymousVisitors(null, null, null, tx))
