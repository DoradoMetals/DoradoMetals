import * as spots from '#db/spots/repo.ts'
import * as metals from '#db/metals/repo.ts'
import * as rules from '#pricing/spots/rules.ts'
import { fetchQuotes } from '#providers/spots/feed.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { SpotPrice, SpotTicker } from '@dorado/contracts'

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

  return await withTransaction(async (tx) => {
    let written = 0
    for (const [metal_id, patch] of quotes) {
      if (!known.has(metal_id)) continue
      if (quoted.has(metal_id)) await spots.update(metal_id, patch, tx)
      else await spots.create(metal_id, patch, tx)
      written += 1
    }
    return written
  })
}
