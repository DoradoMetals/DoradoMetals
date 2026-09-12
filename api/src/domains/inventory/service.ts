import * as lotsRepo from '#db/lots/items/repo.ts'
import * as orderLots from '#db/orders/lots/repo.ts'
import * as rules from '#inventory/rules.ts'
import * as pricing from '#pricing/index.ts'
import * as refining from '#refining/service.ts'
import { retierPremiums } from '#orders/service.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import { withDecisions } from '#shared/views.ts'
import type {
  InventoryLotView,
  InventorySummary,
  LotDetail,
  LotFilter,
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
  rules.assertCombinable(lot_ids, lots, positions)

  const created = await withTransaction(async (tx) => {
    const combined = await lotsRepo.combine(lot_ids, tx)
    rules.assertParentsMarked(
      await lotsRepo.markCombined(lot_ids, combined.id, tx),
      lot_ids.length,
      combined.id
    )
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
