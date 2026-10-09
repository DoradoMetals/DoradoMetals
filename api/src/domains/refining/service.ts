import * as refiningOrders from '#db/refining/orders/repo.ts'
import * as refiningLots from '#db/refining/lots/repo.ts'
import * as pool from '#db/inventory/pool/repo.ts'
import * as lots from '#db/inventory/lots/repo.ts'
import * as ordersRepo from '#db/orders/repo.ts'
import * as orderLots from '#db/orders/lots/repo.ts'
import * as refiners from '#db/refiners/repo.ts'
import * as pdfs from '#db/media/pdfs/repo.ts'
import * as refiningDocuments from '#db/refining/documents/repo.ts'

import * as rules from '#refining/rules.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import { withDecisions } from '#shared/views.ts'
import type { Executor } from '#shared/db/executor.ts'
import type {
  Lot,
  OrderDocument,
  OrderState,
  PoolBalance,
  PoolEntry,
  PoolEntryKind,
  PoolEntryView,
  PoolLockCreate,
  RefinerView,
  RefiningBatch,
  RefiningBatchResult,
  RefiningDirection,
  RefiningLot,
  RefiningLotPatch,
  RefiningOrderCreate,
  RefiningOrderPatch,
  RefiningOrderView,
  RefiningOrderRead,
  RefiningSettlement,
  RefiningSpot,
  SettlementLine,
} from '@dorado/contracts'

export async function list(
  refiner_id: string | null,
  direction: RefiningDirection | null,
  state: OrderState | null
): Promise<RefiningOrderView[]> {
  return await refiningOrders.list(refiner_id, direction, state)
}

export async function view(id: string, executor?: Executor): Promise<RefiningOrderRead> {
  const found = await refiningOrders.view(id, executor)
  rules.assertRefiningOrder(found, id)
  return withDecisions(found, { actions: rules.actionsFor(found) })
}

export async function create(body: RefiningOrderCreate): Promise<RefiningOrderRead> {
  const refiner = await refiners.viewOne(body.refiner_id)
  rules.assertRefiner(refiner, body.refiner_id)
  if (body.direction === 'sell') {
    rules.assertNoOpenSellOrder(await refiningOrders.findOpenSell(body.refiner_id))
  }
  const lot_ids = body.lot_ids ?? []
  if (lot_ids.length > 0) {
    rules.assertLotsExist(await lots.getByIds(lot_ids), lot_ids)
    rules.assertUnassigned(await refiningLots.alreadyBatched(lot_ids), lot_ids)
  }

  const created = await withTransaction(async (tx) => {
    const row = await refiningOrders.create(body, tx)
    if (lot_ids.length > 0) await refiningLots.assign(row.id, lot_ids, tx)
    return row
  })
  return await view(created.id)
}

export async function batch(body: RefiningBatch): Promise<RefiningBatchResult> {
  rules.assertBatchGrain(body)
  const refiner = await refiners.viewOne(body.refiner_id)
  rules.assertRefiner(refiner, body.refiner_id)

  const explicit = body.lot_ids !== undefined
  const rawNamed = explicit
    ? body.lot_ids!
    : (await Promise.all(body.order_ids!.map((order_id) => orderLots.getFor(order_id))))
        .flat()
        .map((row) => row.lot_id)
  const named = [...new Set(rawNamed)]

  if (explicit) rules.assertLotsExist(await lots.getByIds(named), named)

  const takenIds = new Set(await refiningLots.alreadyBatched(named))
  if (explicit) rules.assertUnassigned([...takenIds], named)

  const positions = await lots.positionsOf(named)
  const eligible = positions.filter((row) => row.position === 'on hand' && !takenIds.has(row.id))
  const skipped = positions.filter((row) => row.position !== 'on hand' || takenIds.has(row.id))

  if (explicit) {
    rules.assertOnHandNamed(skipped.filter((row) => !takenIds.has(row.id)))
  }

  const open = await refiningOrders.findOpenSell(body.refiner_id)
  const target = await withTransaction(async (tx) => {
    const order =
      open ?? (await refiningOrders.create({ refiner_id: body.refiner_id, direction: 'sell' }, tx))
    if (eligible.length > 0) {
      await refiningLots.assign(
        order.id,
        eligible.map((row) => row.id),
        tx
      )
    }
    return order
  })

  return rules.batchResult(await view(target.id), eligible.length, skipped)
}

export async function cancel(id: string): Promise<RefiningOrderRead> {
  const order = await refiningOrders.getOne(id)
  rules.assertRefiningOrder(order, id)
  rules.assertCancellable(order)

  await withTransaction(async (tx) => {
    await refiningLots.removeFor(id, tx)
    rules.assertRefiningOrder(await refiningOrders.cancel(id, tx), id)
  })
  return await view(id)
}

export async function spotsFor(id: string): Promise<RefiningSpot[]> {
  rules.assertRefiningOrder(await refiningOrders.getOne(id), id)
  return await refiningOrders.spots(id)
}

export async function documentsFor(id: string): Promise<OrderDocument[]> {
  const order = await refiningOrders.getOne(id)
  rules.assertRefiningOrder(order, id)
  const stored = await pdfs.storedKinds(null, id)
  const offered = await refiningDocuments.list()
  return rules.documentsFor(order.sent_at !== null, stored, offered)
}

export async function settlementLinesFor(id: string): Promise<SettlementLine[]> {
  rules.assertRefiningOrder(await refiningOrders.getOne(id), id)
  return await refiningLots.settlementLines(id)
}

export async function patch(id: string, changes: RefiningOrderPatch): Promise<RefiningOrderRead> {
  rules.assertNamesAField(changes)
  const written = await withTransaction((tx) => refiningOrders.update(id, changes, tx))
  rules.assertRefiningOrder(written, id)
  return await view(id)
}

export async function lotsFor(refining_order_id: string): Promise<RefiningLot[]> {
  return await refiningLots.getFor(refining_order_id)
}

export async function assignLots(
  refining_order_id: string,
  lot_ids: string[]
): Promise<RefiningLot[]> {
  const order = await refiningOrders.getOne(refining_order_id)
  rules.assertRefiningOrder(order, refining_order_id)
  rules.assertLotsExist(await lots.getByIds(lot_ids), lot_ids)
  rules.assertUnassigned(await refiningLots.alreadyBatched(lot_ids), lot_ids)

  return await withTransaction((tx) => refiningLots.assign(refining_order_id, lot_ids, tx))
}

export async function removeLot(id: string): Promise<void> {
  const lot = await refiningLots.getOne(id)
  rules.assertRefiningLot(lot, id)
  const order = await refiningOrders.getOne(lot.refining_order_id)
  rules.assertRefiningOrder(order, lot.refining_order_id)
  await withTransaction(async (tx) => rules.assertLotRemoved(await refiningLots.remove(id, tx), id))
}

export async function recordAssay(id: string, changes: RefiningLotPatch): Promise<Lot> {
  rules.assertNamesAField(changes)
  const link = await refiningLots.getOne(id)
  rules.assertRefiningLot(link, id)
  const current = await lots.getOne(link.lot_id)
  rules.assertRefiningLot(current, link.lot_id)
  rules.assertWeighable(changes, current)

  const written = await withTransaction((tx) => refiningLots.update(id, changes, tx))
  rules.assertRefiningLot(written, id)
  return written
}

export async function send(id: string): Promise<RefiningOrderRead> {
  const order = await refiningOrders.getOne(id)
  rules.assertRefiningOrder(order, id)
  rules.assertSendable(order, await refiningLots.getFor(id))

  await withTransaction((tx) => refiningOrders.send(id, tx))
  return await view(id)
}

export async function settle(id: string, body: RefiningSettlement): Promise<RefiningOrderRead> {
  const order = await refiningOrders.getOne(id)
  rules.assertRefiningOrder(order, id)
  rules.assertSettleable(order)
  rules.assertPooledHasNoSpot(order, body.lots)

  const held = await refiningLots.getFor(id)
  rules.assertSettling(held, body.lots)

  const current = await lots.getByIds(held.map((lot) => lot.lot_id))
  for (const line of body.lots) {
    rules.assertWeighable(
      line,
      current.find((lot) => lot.id === line.lot_id)!
    )
  }

  await withTransaction(async (tx) => {
    const settled = await refiningLots.settle(id, body.lots, tx)
    rules.assertEveryLotSettled(settled.length, body.lots.length, id)
    rules.assertRefiningOrder(
      await refiningOrders.settle(id, body.fee ?? null, body.statement_reference ?? null, tx),
      id
    )
    await pool.credit(id, tx)
  })

  return await view(id)
}

export async function balances(
  refiner_id: string | null,
  metal_id: string | null
): Promise<PoolBalance[]> {
  return await pool.balances(refiner_id, metal_id)
}

export async function entries(
  refiner_id: string | null,
  metal_id: string | null,
  entry: PoolEntryKind | null
): Promise<PoolEntryView[]> {
  return await pool.entries(refiner_id, metal_id, entry)
}

export async function lockFromPool(body: PoolLockCreate): Promise<PoolEntry> {
  if (body.refining_order_id) {
    rules.assertRefiningOrder(
      await refiningOrders.getOne(body.refining_order_id),
      body.refining_order_id
    )
  }
  rules.assertLockable(body.troy_oz)
  return await withTransaction((tx) => pool.lock(body, tx))
}

export async function supplyOrder(
  order_id: string,
  refiner_id: string
): Promise<RefiningOrderRead> {
  rules.assertSaleOrder(await ordersRepo.directionOf(order_id), order_id)
  const refiner = await refiners.viewOne(refiner_id)
  rules.assertRefiner(refiner, refiner_id)

  const lot_ids = (await orderLots.getFor(order_id)).map((row) => row.lot_id)
  rules.assertSuppliable(lot_ids, order_id)
  rules.assertUnassigned(await refiningLots.alreadyBatched(lot_ids), lot_ids)

  const id = await withTransaction(async (tx) => {
    const created = await refiningOrders.create({ refiner_id, direction: 'buy' }, tx)
    await refiningLots.assign(created.id, lot_ids, tx)
    return created.id
  })

  return await send(id)
}

export async function sellToRefiner(
  order_id: string,
  refiner_id: string
): Promise<RefiningOrderRead> {
  rules.assertPurchaseOrder(await ordersRepo.directionOf(order_id), order_id)
  rules.assertOrderExists(await ordersRepo.getOne(order_id), order_id)
  const refiner = await refiners.viewOne(refiner_id)
  rules.assertRefiner(refiner, refiner_id)

  const lot_ids = (await orderLots.getFor(order_id)).map((row) => row.lot_id)
  rules.assertSuppliable(lot_ids, order_id)
  rules.assertUnassigned(await refiningLots.alreadyBatched(lot_ids), lot_ids)

  const open = await refiningOrders.findOpenSell(refiner_id)
  const id = await withTransaction(async (tx) => {
    const target = open ?? (await refiningOrders.create({ refiner_id, direction: 'sell' }, tx))
    await refiningLots.assign(target.id, lot_ids, tx)
    return target.id
  })
  return await view(id)
}

export async function allRefiners(): Promise<RefinerView[]> {
  return await refiners.viewAll()
}

export async function refinerFromId(id: string): Promise<RefinerView | null> {
  return (await refiners.viewOne(id)) ?? null
}
