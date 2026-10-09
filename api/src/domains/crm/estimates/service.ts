import withTransaction from '#shared/db/withTransaction.ts'
import * as leads from '#db/leads/repo.ts'
import * as items from '#db/leads/estimate-items/repo.ts'
import * as rules from '#crm/estimates/rules.ts'
import type { EstimateItem, EstimateItemPatch } from '@dorado/contracts'

export async function forLead(lead_id: string): Promise<EstimateItem[]> {
  const lead = await leads.getOne(lead_id)
  rules.assertLead(lead, lead_id)
  return await items.forLead(lead_id)
}

export async function create(lead_id: string, patch: EstimateItemPatch): Promise<EstimateItem> {
  rules.assertCreatable(patch)
  return withTransaction(async (tx) => {
    const lead = await leads.getOne(lead_id, tx)
    rules.assertLead(lead, lead_id)
    return await items.create(lead_id, patch, tx)
  })
}

export async function update(
  lead_id: string,
  id: string,
  patch: EstimateItemPatch
): Promise<EstimateItem> {
  return withTransaction(async (tx) => {
    const current = await items.getOne(lead_id, id, tx)
    rules.assertItem(current, id)
    rules.assertOnePurity(
      patch.purity_id === undefined ? current.purity_id : patch.purity_id,
      patch.custom_purity === undefined ? current.custom_purity : patch.custom_purity
    )
    const written = await items.update(lead_id, id, patch, tx)
    rules.assertItem(written, id)
    return written
  })
}

export async function remove(lead_id: string, id: string): Promise<boolean> {
  return withTransaction(async (tx) => await items.remove(lead_id, id, tx))
}
