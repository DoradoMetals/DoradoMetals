import * as spots from '#db/spots/repo.ts'
import * as metals from '#db/metals/repo.ts'
import * as sources from '#db/spots/sources/repo.ts'
import * as activeSources from '#db/spots/active-sources/repo.ts'
import * as adjustments from '#db/spots/adjustments/repo.ts'
import * as adjustmentHistory from '#db/spots/adjustment-history/repo.ts'
import * as settings from '#db/spots/settings/repo.ts'
import * as locks from '#db/spots/locks/repo.ts'
import * as rules from '#pricing/spots/rules.ts'
import { SOURCE_ID, fetchQuotes } from '#providers/nfusion/feed.ts'
import { reportError } from '#shared/observability/report.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import type { Executor } from '#shared/db/executor.ts'
import type {
  ActiveSpotSource,
  ActiveSpotSourcePatch,
  SpotAdjustmentChangeRead,
  SpotAdjustmentPatch,
  SpotAdjustmentRead,
  SpotLock,
  SpotPrice,
  SpotSettings,
  SpotSettingsPatch,
  SpotSourcePatch,
  SpotSourceRead,
  SpotTicker,
} from '@dorado/contracts'

export async function getSpotPrices(executor?: Executor): Promise<SpotPrice[]> {
  return await spots.list(executor)
}

export async function listTicker(): Promise<SpotTicker[]> {
  return rules.ticker(await spots.list())
}

export async function updateSpotPrices(): Promise<number> {
  const polled = await sources.stampAttempt(SOURCE_ID)
  const quotes = await fetchQuotes()
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

  const ticked = await sources.stampTick(SOURCE_ID)
  if (!polled || !ticked) {
    reportError({
      at: 'pricing.spots.updateSpotPrices',
      message:
        `the feed wrote ${written} quote(s) and spots.sources has no row named ` +
        `${SOURCE_ID}, so the Spots screen reports no tick for it and no metal ` +
        `can name it as an active source`,
      extra: { source_id: SOURCE_ID, written },
    })
  }
  return written
}

export async function refresh(): Promise<SpotTicker[]> {
  await updateSpotPrices()
  return await listTicker()
}

export async function listSources(): Promise<SpotSourceRead[]> {
  return await sources.list()
}

export async function updateSource(id: string, patch: SpotSourcePatch): Promise<SpotSourceRead> {
  rules.assertSource(await sources.getOne(id), id)
  await withTransaction(async (tx) => await sources.update(id, patch, tx))
  const updated = await sources.getOne(id)
  rules.assertSource(updated, id)
  return updated
}

export async function listActiveSources(): Promise<ActiveSpotSource[]> {
  return await activeSources.list()
}

export async function setActiveSource(
  metal_id: string,
  patch: ActiveSpotSourcePatch
): Promise<ActiveSpotSource> {
  rules.assertSource(await sources.getOne(patch.source_id), patch.source_id)
  await withTransaction(async (tx) => await activeSources.set(metal_id, patch.source_id, tx))
  const row = await activeSources.getOne(metal_id)
  rules.assertActiveSource(row, metal_id)
  return row
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

export async function listAdjustmentHistory(
  days: number,
  metal_id: string | null
): Promise<SpotAdjustmentChangeRead[]> {
  return await adjustmentHistory.list(days, metal_id)
}

export async function listLocks(): Promise<SpotLock[]> {
  return await locks.list()
}

export async function getSettings(): Promise<SpotSettings> {
  return await settings.getOne()
}

export async function updateSettings(patch: SpotSettingsPatch): Promise<SpotSettings> {
  await withTransaction(async (tx) => await settings.update(patch, tx))
  return await getSettings()
}
