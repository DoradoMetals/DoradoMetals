import withTransaction from '#shared/db/withTransaction.ts'
import * as rates from '#db/rates/repo.ts'
import * as rules from '#pricing/rates/rules.ts'
import type { AdminRate, RateChange, RatePatch, RateRead, RateTier } from '@dorado/contracts'

export async function listRates(): Promise<RateRead[]> {
  return await rates.list()
}

export async function listAdminRates(): Promise<AdminRate[]> {
  return await rates.listAdmin()
}

export async function listTiers(): Promise<RateTier[]> {
  return rules.tiers(await rates.list())
}

export async function getRate(id: string): Promise<AdminRate> {
  const row = await rates.getOne(id)
  rules.assertRate(row, id)
  return row
}

export async function createRate(patch: RatePatch): Promise<AdminRate> {
  const id = await withTransaction(async (tx) => await rates.create(patch, tx))
  return await getRate(id)
}

export async function updateRate(id: string, patch: RatePatch): Promise<AdminRate> {
  const changed = await withTransaction(async (tx) => await rates.update(id, patch, tx))
  rules.assertChanged(changed, id)
  return await getRate(id)
}

export async function deleteRate(id: string): Promise<boolean> {
  return await withTransaction(async (tx) => await rates.remove(id, tx))
}

export async function getHistory(): Promise<RateChange[]> {
  return await rates.history()
}
