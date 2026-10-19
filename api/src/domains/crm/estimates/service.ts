import withTransaction from '#shared/db/withTransaction.ts'
import * as leads from '#db/leads/repo.ts'
import * as items from '#db/leads/estimate-items/repo.ts'
import * as itemImages from '#db/leads/estimate-item-images/repo.ts'
import * as imageService from '#accounts/images/service.ts'
import * as rules from '#crm/estimates/rules.ts'
import { withDecisions } from '#shared/views.ts'
import type {
  EstimateItem,
  EstimateItemImageView,
  EstimateItemPatch,
  EstimateItemView,
} from '@dorado/contracts'

export async function forLead(lead_id: string): Promise<EstimateItemView[]> {
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

export async function images(lead_id: string, item_id: string): Promise<EstimateItemImageView[]> {
  rules.assertItem(await items.getOne(lead_id, item_id), item_id)
  const links = await itemImages.list(item_id)
  return await Promise.all(
    links.map(async (link) =>
      withDecisions(link, { url: await imageService.getUrl(link.image_id) })
    )
  )
}

export async function addImage(
  lead_id: string,
  item_id: string,
  image_id: string
): Promise<EstimateItemImageView[]> {
  rules.assertItem(await items.getOne(lead_id, item_id), item_id)
  await withTransaction((tx) => itemImages.create(item_id, image_id, tx))
  return await images(lead_id, item_id)
}

export async function removeImage(
  lead_id: string,
  item_id: string,
  image_id: string
): Promise<EstimateItemImageView[]> {
  rules.assertItem(await items.getOne(lead_id, item_id), item_id)
  const removed = await withTransaction((tx) => itemImages.remove(item_id, image_id, tx))
  rules.assertItemImage(removed, item_id, image_id)
  return await images(lead_id, item_id)
}
