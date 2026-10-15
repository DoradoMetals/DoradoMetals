import * as lotsRepo from '#db/inventory/lots/repo.ts'
import * as lotSourcesRepo from '#db/inventory/lot-sources/repo.ts'
import * as lotImagesRepo from '#db/inventory/lot-images/repo.ts'
import * as imageService from '#accounts/images/service.ts'
import * as orderLots from '#db/orders/lots/repo.ts'
import * as rules from '#inventory/rules.ts'
import * as pricing from '#pricing/index.ts'
import * as refining from '#refining/service.ts'
import { retierPremiums } from '#orders/service.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import type { Executor } from '#shared/db/executor.ts'
import { withDecisions } from '#shared/views.ts'
import type {
  InventoryLotView,
  InventorySummary,
  LotDetail,
  LotFilter,
  LotImageView,
  LotSplitPart,
  OrderLotView,
} from '@dorado/contracts'

export async function list(filter: LotFilter): Promise<InventoryLotView[]> {
  return await lotsRepo.list(filter)
}

export async function detail(id: string): Promise<LotDetail> {
  const found = await lotsRepo.detail(id)
  rules.assertLot(found, id)
  return withDecisions(found, { actions: rules.actionsFor(found.lot.position) })
}

export async function combine(lot_ids: string[]): Promise<InventoryLotView> {
  const lots = await lotsRepo.getByIds(lot_ids)
  const positions = await lotsRepo.positionsOf(lot_ids)
  const sources = await lotSourcesRepo.sourcesOf(lot_ids)
  const refinerLot = rules.assertCombinable(lot_ids, lots, positions, sources)

  const created = await withTransaction(async (tx) => {
    const combined = await lotsRepo.combine(lot_ids, tx)
    rules.assertParentsMarked(
      await lotsRepo.linkCombined(lot_ids, combined.id, tx),
      lot_ids.length,
      combined.id
    )
    if (refinerLot !== null) {
      await lotSourcesRepo.repoint(refinerLot, combined.id, 'batch', tx)
    }
    return combined
  })

  const found = await detail(created.id)
  return found.lot
}

export async function split(order_lot_id: string, parts: LotSplitPart[]): Promise<OrderLotView[]> {
  const link = await orderLots.getOne(order_lot_id)
  rules.assertOrderLot(link, order_lot_id)

  const positions = await lotsRepo.positionsOf([link.lot_id])
  rules.assertSplittable(positions[0]?.position, link.lot_id)

  await withTransaction(async (tx) => {
    for (const child of await lotsRepo.splitOff(link.lot_id, parts, tx)) {
      await orderLots.link(link.order_id, child.id, tx)
    }
    await retierPremiums(link.order_id, tx)
  })

  return await orderLots.viewFor(link.order_id)
}

export async function summary(): Promise<InventorySummary> {
  const metals = await pricing.inventoryMetals()
  const pool = await refining.balances(null, null)
  return { metals, pool }
}

export async function images(lot_id: string): Promise<LotImageView[]> {
  rules.assertLot(await lotsRepo.getOne(lot_id), lot_id)
  const links = await lotImagesRepo.list(lot_id)
  return await Promise.all(
    links.map(async (link) =>
      withDecisions(link, { url: await imageService.getUrl(link.image_id) })
    )
  )
}

export async function addImage(lot_id: string, image_id: string): Promise<LotImageView[]> {
  rules.assertLot(await lotsRepo.getOne(lot_id), lot_id)
  await withTransaction((tx) => lotImagesRepo.create(lot_id, image_id, tx))
  return await images(lot_id)
}

export async function coverImage(lot_id: string, image_id: string, tx: Executor): Promise<void> {
  await lotImagesRepo.cover(lot_id, image_id, tx)
}

export async function removeImage(lot_id: string, image_id: string): Promise<LotImageView[]> {
  const removed = await withTransaction((tx) => lotImagesRepo.remove(lot_id, image_id, tx))
  rules.assertLotImage(removed, lot_id, image_id)
  return await images(lot_id)
}
