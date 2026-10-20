import * as pricing from '#db/pricing/repo.ts'
import * as rules from '#pricing/rules.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { LeadEstimate, LeadEstimateTotal, LeadSortDirection } from '@dorado/contracts'

export async function forLead(lead_id: string, executor?: Executor): Promise<LeadEstimate> {
  const estimate = await pricing.leadEstimate(lead_id, executor)
  rules.assertPriced(estimate, `lead ${lead_id}`)
  return estimate
}

export async function totals(
  lead_ids: readonly string[],
  executor?: Executor
): Promise<LeadEstimateTotal[]> {
  return await pricing.leadEstimateTotals(lead_ids, executor)
}

export async function rank(
  lead_ids: readonly string[],
  direction: LeadSortDirection,
  executor?: Executor
): Promise<string[]> {
  return await pricing.leadEstimateRank(lead_ids, direction, executor)
}
