import * as spots from '#db/spots/repo.ts'
import * as metals from '#db/metals/repo.ts'
import * as overrides from '#db/spots/overrides/repo.ts'
import * as settings from '#db/spots/settings/repo.ts'
import * as locks from '#db/spots/locks/repo.ts'
import * as rules from '#pricing/spots/rules.ts'
import { fetchQuotes } from '#providers/nfusion/feed.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import type { Executor } from '#shared/db/executor.ts'
import type {
  SpotLock,
  SpotOverridePatch,
  SpotOverrideRead,
  SpotPrice,
  SpotSettings,
  SpotSettingsPatch,
  SpotTicker,
} from '@dorado/contracts'

export async function getSpotPrices(executor?: Executor): Promise<SpotPrice[]> {
  return await spots.list(executor)
}

export async function listTicker(): Promise<SpotTicker[]> {
  return rules.ticker(await spots.list())
}

export async function updateSpotPrices(): Promise<number> {
  const quotes = await fetchQuotes()
  const known = new Set((await metals.list()).map((metal) => metal.id))
  const quoted = new Set((await spots.list()).map((row) => row.id))
  const overridden = new Set(await overrides.activeMetalIds())

  return await withTransaction(async (tx) => {
    let written = 0
    for (const [metal_id, patch] of quotes) {
      if (!known.has(metal_id)) continue
      if (overridden.has(metal_id)) continue
      if (quoted.has(metal_id)) await spots.update(metal_id, patch, tx)
      else await spots.create(metal_id, patch, tx)
      written += 1
    }
    return written
  })
}

export async function setOverride(
  metal_id: string,
  patch: SpotOverridePatch
): Promise<SpotOverrideRead> {
  return await withTransaction(async (tx) => await overrides.set(metal_id, patch, tx))
}

export async function removeOverride(metal_id: string): Promise<void> {
  const removed = await withTransaction(async (tx) => await overrides.remove(metal_id, tx))
  rules.assertOverrideRemoved(removed, metal_id)
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
