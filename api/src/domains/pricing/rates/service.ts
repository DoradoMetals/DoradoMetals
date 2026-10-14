import withTransaction from '#shared/db/withTransaction.ts'
import * as rates from '#db/rates/repo.ts'
import * as metals from '#db/metals/repo.ts'
import * as pricing from '#db/pricing/repo.ts'
import * as rules from '#pricing/rates/rules.ts'
import type {
  AdminRate,
  RateBandsBody,
  RateChangeFilter,
  RateChangePage,
  RatePay,
  RateTier,
} from '@dorado/contracts'

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

export async function listPay(unit: string, metal_id: string | null = null): Promise<RatePay[]> {
  const view = await pricing.ratePay(unit, metal_id)
  rules.assertUnit(view, unit)
  return view.bands
}

export async function replaceBands(
  metal_id: string,
  body: RateBandsBody,
  unit: string
): Promise<RatePay[]> {
  rules.assertMetal(await metals.getOne(metal_id), metal_id)
  rules.assertBands(body.bands)
  await withTransaction(async (tx) => await rates.replaceBands(metal_id, body.bands, tx))
  return await listPay(unit, metal_id)
}

export async function listChanges(filter: RateChangeFilter): Promise<RateChangePage> {
  return await rates.changes(filter)
}
