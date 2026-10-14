import * as spots from '#db/spots/repo.ts'
import * as metals from '#db/metals/repo.ts'
import * as sources from '#db/spots/sources/repo.ts'
import * as activeSources from '#db/spots/active-sources/repo.ts'
import * as adjustments from '#db/spots/adjustments/repo.ts'
import * as adjustmentHistory from '#db/spots/adjustment-history/repo.ts'
import * as settings from '#db/spots/settings/repo.ts'
import * as locks from '#db/spots/locks/repo.ts'
import * as orderSpots from '#orders/spots/service.ts'
import * as rules from '#pricing/spots/rules.ts'
import { SOURCE_ID, fetchQuotes } from '#providers/nfusion/feed.ts'
import { reportError } from '#shared/observability/report.ts'
import { attempt } from '#shared/attempt.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import type { Executor } from '#shared/db/executor.ts'
import type {
  ActiveSpotSource,
  ActiveSpotSourcePatch,
  MetalSpot,
  SpotActivity,
  SpotAdjustmentChangeRead,
  SpotAdjustmentPatch,
  SpotAdjustmentRead,
  SpotBoard,
  SpotFreezeBody,
  SpotLock,
  SpotLockFilter,
  SpotLockPage,
  SpotPrice,
  SpotSettings,
  SpotSettingsPatch,
  SpotSourcePatch,
  SpotSourceRead,
} from '@dorado/contracts'

export async function getSpotPrices(executor?: Executor): Promise<SpotPrice[]> {
  return await spots.list(executor)
}

export async function board(): Promise<SpotBoard> {
  return await spots.board()
}

function reportUnstamped(stamped: boolean, written: number): void {
  if (stamped) return
  reportError({
    at: 'pricing.spots.updateSpotPrices',
    message:
      `the feed wrote ${written} quote(s) and spots.sources has no row named ` +
      `${SOURCE_ID}, so the Spots screen reports no tick for it and no metal ` +
      `can name it as an active source`,
    extra: { source_id: SOURCE_ID, written },
  })
}

export async function updateSpotPrices(): Promise<number> {
  const polled = await sources.stampAttempt(SOURCE_ID)
  const quotes = await attempt('pricing.spots.fetchQuotes', fetchQuotes)
  if (!quotes) {
    reportUnstamped(polled && (await sources.recordFailure(SOURCE_ID)), 0)
    return 0
  }
  const known = new Set((await metals.list()).map((metal) => metal.id))

  const written = await withTransaction(async (tx) => {
    let count = 0
    for (const [metal_id, patch] of quotes) {
      if (!known.has(metal_id)) continue
      await spots.upsert(metal_id, patch, tx)
      count += 1
    }
    return count
  })

  reportUnstamped(polled && (await sources.stampTick(SOURCE_ID)), written)
  return written
}

export async function refresh(): Promise<SpotBoard> {
  await updateSpotPrices()
  return await board()
}

export async function listSources(): Promise<SpotSourceRead[]> {
  return await sources.list()
}

export async function updateSource(id: string, patch: SpotSourcePatch): Promise<SpotSourceRead> {
  rules.assertSource(await sources.getOne(id), id)
  rules.assertDefaultMoves(patch)
  const written = await withTransaction(async (tx) => {
    const edited = await sources.update(id, patch, tx)
    return patch.is_default ? edited && (await sources.makeDefault(id, tx)) : edited
  })
  rules.assertSourceWritten(written, id)
  const updated = await sources.getOne(id)
  rules.assertSource(updated, id)
  return updated
}

export async function listActiveSources(): Promise<ActiveSpotSource[]> {
  return await activeSources.list()
}

export async function getMetal(metal_id: string): Promise<MetalSpot> {
  const metal = await spots.metal(metal_id)
  rules.assertMetal(metal, metal_id)
  return metal
}

export async function setMetalSource(
  metal_id: string,
  patch: ActiveSpotSourcePatch
): Promise<MetalSpot> {
  rules.assertMetal(await spots.metal(metal_id), metal_id)
  const source = patch.source_id === null ? undefined : await sources.getOne(patch.source_id)
  rules.assertSourceOrDefault(patch.source_id, source)

  await withTransaction(async (tx) =>
    patch.source_id === null
      ? await activeSources.clear(metal_id, tx)
      : await activeSources.set(metal_id, patch.source_id, tx)
  )
  return await getMetal(metal_id)
}

export async function metalActivity(metal_id: string, days: number): Promise<SpotActivity[]> {
  rules.assertMetal(await spots.metal(metal_id), metal_id)
  return await spots.activity(metal_id, days)
}

export async function listAdjustments(): Promise<SpotAdjustmentRead[]> {
  return await adjustments.list()
}

export async function setAdjustment(
  metal_id: string,
  source_id: string,
  patch: SpotAdjustmentPatch
): Promise<SpotAdjustmentRead> {
  rules.assertSource(await sources.getOne(source_id), source_id)
  const metal = await spots.metal(metal_id)
  rules.assertMetal(metal, metal_id)
  rules.assertFreezable(metal, patch)
  const existing = await adjustments.getOne(metal_id, source_id)
  rules.assertAdjustmentReason(existing !== undefined, patch)

  await withTransaction(async (tx) =>
    existing
      ? await adjustments.update(metal_id, source_id, patch, tx)
      : await adjustments.create(metal_id, source_id, patch, tx)
  )

  const row = await adjustments.getOne(metal_id, source_id)
  rules.assertAdjustment(row, metal_id, source_id)
  return row
}

export async function removeAdjustment(metal_id: string, source_id: string): Promise<void> {
  const removed = await withTransaction(
    async (tx) => await adjustments.remove(metal_id, source_id, tx)
  )
  rules.assertAdjustmentRemoved(removed, metal_id, source_id)
}

export async function cancelAdjustment(metal_id: string): Promise<void> {
  const cancelled = await withTransaction(async (tx) => await adjustments.cancel(metal_id, tx))
  rules.assertCancelled(cancelled, metal_id)
}

export async function freezeAll(body: SpotFreezeBody): Promise<SpotBoard> {
  rules.assertFreezeReason(body.reason)
  await withTransaction(async (tx) => await adjustments.freezeAll(body.reason, tx))
  return await board()
}

export async function listAdjustmentHistory(
  days: number,
  metal_id: string | null
): Promise<SpotAdjustmentChangeRead[]> {
  return await adjustmentHistory.list(days, metal_id)
}

export async function listLocks(filter: SpotLockFilter): Promise<SpotLockPage> {
  return await locks.page(filter)
}

export async function unlock(id: string): Promise<SpotLock> {
  const lock = await locks.getOne(id)
  rules.assertLock(lock, id)
  rules.assertLockActive(lock)
  await orderSpots.setSpots(lock.order_id, { lock: false })
  const released = await locks.getOne(id)
  rules.assertLock(released, id)
  return released
}

export async function getSettings(): Promise<SpotSettings> {
  return await settings.getOne()
}

export async function updateSettings(patch: SpotSettingsPatch): Promise<SpotSettings> {
  await withTransaction(async (tx) => await settings.update(patch, tx))
  return await getSettings()
}
