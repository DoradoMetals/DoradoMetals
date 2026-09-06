import * as refiningOrders from '#db/refining/orders/repo.ts'
import * as refiningLots from '#db/refining/lots/repo.ts'
import * as pool from '#db/refining/pool/repo.ts'
import * as lots from '#db/lots/items/repo.ts'
import * as ordersRepo from '#db/orders/repo.ts'
import * as orderLots from '#db/orders/lots/repo.ts'
import * as refiners from '#db/refiners/repo.ts'
import * as pdfs from '#db/media/pdfs/repo.ts'

import * as rules from '#refining/rules.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import type { Executor } from '#shared/db/executor.ts'
import type {
  OrderDocument,
  PoolBalance,
  PoolEntry,
  PoolLockCreate,
  RefinerView,
  RefiningDirection,
  RefiningLot,
  RefiningLotPatch,
  RefiningOrderCreate,
  RefiningOrderPatch,
  RefiningOrderView,
  RefiningSettlement,
  RefiningSpot,
} from '@dorado/contracts'

export async function list(
  refiner_id: string | null,
  direction: RefiningDirection | null,
  state: string | null
): Promise<RefiningOrderView[]> {
  return await refiningOrders.list(refiner_id, direction, state)
}

export async function view(id: string, executor?: Executor): Promise<RefiningOrderView> {
  const found = await refiningOrders.view(id, executor)
  rules.assertRefiningOrder(found, id)
  return found
}

// One open sell order per refiner is the pooling mechanic: lots accumulate onto
// it until it is sent. The partial unique index is what guarantees it; this
// read is what turns a second one into a refusal that names the order the
// caller should be adding to, rather than a 23505 carrying an index name.
export async function create(body: RefiningOrderCreate): Promise<RefiningOrderView> {
  const refiner = await refiners.viewOne(body.refiner_id)
  rules.assertRefiner(refiner, body.refiner_id)
  if (body.direction === 'sell') {
    rules.assertNoOpenSellOrder(await refiningOrders.findOpenSell(body.refiner_id))
  }
  const lot_ids = body.lot_ids ?? []
  if (lot_ids.length > 0) {
    rules.assertLotsExist(await lots.getByIds(lot_ids), lot_ids)
    rules.assertUnassigned(await refiningLots.getByLots(lot_ids), lot_ids)
  }

  // The batch is ONE transaction. Creating the order and then assigning its lots
  // in two calls left an empty refiner order behind whenever the second failed.
  const created = await withTransaction(async (tx) => {
    const row = await refiningOrders.create(body, tx)
    if (lot_ids.length > 0) await refiningLots.assign(row.id, lot_ids, tx)
    return row
  })
  return await view(created.id)
}

// Cancelling releases the lots: `a_lot_goes_to_one_refiner` is unique on lot_id,
// so a lot left on a cancelled order could never be batched again.
export async function cancel(id: string): Promise<RefiningOrderView> {
  const order = await refiningOrders.getOne(id)
  rules.assertRefiningOrder(order, id)
  rules.assertCancellable(order)

  await withTransaction(async (tx) => {
    await refiningLots.removeFor(id, tx)
    rules.assertRefiningOrder(await refiningOrders.cancel(id, tx), id)
  })
  return await view(id)
}

// A refiner order's four frozen prices. It never has an orders.spots row - the
// price its metal changed hands at is the pool's last lock (GAP 7).
export async function spotsFor(id: string): Promise<RefiningSpot[]> {
  rules.assertRefiningOrder(await refiningOrders.getOne(id), id)
  return await refiningOrders.spots(id)
}

export async function documentsFor(id: string): Promise<OrderDocument[]> {
  const order = await refiningOrders.getOne(id)
  rules.assertRefiningOrder(order, id)
  return rules.documentsFor(order.sent_at !== null, await pdfs.storedKinds(null, id))
}

export async function patch(id: string, changes: RefiningOrderPatch): Promise<RefiningOrderView> {
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
  rules.assertOpen(order)
  rules.assertLotsExist(await lots.getByIds(lot_ids), lot_ids)
  rules.assertUnassigned(await refiningLots.getByLots(lot_ids), lot_ids)

  return await withTransaction((tx) => refiningLots.assign(refining_order_id, lot_ids, tx))
}

export async function removeLot(id: string): Promise<void> {
  const lot = await refiningLots.getOne(id)
  rules.assertRefiningLot(lot, id)
  const order = await refiningOrders.getOne(lot.refining_order_id)
  rules.assertRefiningOrder(order, lot.refining_order_id)
  rules.assertOpen(order)
  await withTransaction(async (tx) => rules.assertLotRemoved(await refiningLots.remove(id, tx), id))
}

export async function recordAssay(id: string, changes: RefiningLotPatch): Promise<RefiningLot> {
  rules.assertNamesAField(changes)
  const lot = await refiningLots.getOne(id)
  rules.assertRefiningLot(lot, id)
  rules.assertWeighable(changes, lot)

  const written = await withTransaction((tx) => refiningLots.update(id, changes, tx))
  rules.assertRefiningLot(written, id)
  return written
}

// Sending closes the order to further lots. Telling the refiner is a manual
// send off the Documents card (ruling 15), not something this stamp does.
export async function send(id: string): Promise<RefiningOrderView> {
  const order = await refiningOrders.getOne(id)
  rules.assertRefiningOrder(order, id)
  rules.assertSendable(order, await refiningLots.getFor(id))

  await withTransaction((tx) => refiningOrders.send(id, tx))
  return await view(id)
}

// Settlement is the one write that touches four tables, so it is one
// transaction: the fee and the statement reference on the order, the refiner's
// premium and assay on every lot, every lot's settled_at, and the pool credits
// a sell order earns.
export async function settle(
  id: string,
  body: RefiningSettlement
): Promise<RefiningOrderView> {
  const order = await refiningOrders.getOne(id)
  rules.assertRefiningOrder(order, id)
  rules.assertSettleable(order)

  // Every refusal happens BEFORE the write: `settled_lots_carry_a_premium` is a
  // CHECK, and a settlement that reached it would answer with a constraint name
  // instead of saying which lots the refiner priced nothing for.
  const held = await refiningLots.getFor(id)
  rules.assertSettling(held, body.lots)
  for (const line of body.lots) {
    rules.assertWeighable(line, held.find((lot) => lot.lot_id === line.lot_id)!)
  }
  rules.assertSettlementPremiums(held, body.lots)

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
  metal_id: string | null
): Promise<PoolEntry[]> {
  return await pool.entries(refiner_id, metal_id)
}

export async function lockFromPool(body: PoolLockCreate): Promise<PoolEntry> {
  const order = await refiningOrders.getOne(body.refining_order_id)
  rules.assertRefiningOrder(order, body.refining_order_id)
  const [balance] = await pool.balances(body.refiner_id, body.metal_id)
  rules.assertLockable(balance?.troy_oz ?? 0, body.troy_oz)
  return await withTransaction((tx) => pool.lock(body, tx))
}

// The sale-side supplier flow, in one call: a customer's sales order is filled
// by a supplier, so the business places a `buy` order carrying the same lots.
// The URL is the customer order's, because that is the id the caller holds;
// the handler is here, because these are the tables this domain owns (ruling
// 26b). No foreign key joins the two orders - the lot is the join.
export async function supplyOrder(
  order_id: string,
  refiner_id: string
): Promise<RefiningOrderView> {
  rules.assertSaleOrder(await ordersRepo.directionOf(order_id), order_id)
  const refiner = await refiners.viewOne(refiner_id)
  rules.assertRefiner(refiner, refiner_id)

  const lot_ids = (await orderLots.getFor(order_id)).map((row) => row.lot_id)
  rules.assertSuppliable(lot_ids, order_id)
  rules.assertUnassigned(await refiningLots.getByLots(lot_ids), lot_ids)

  const id = await withTransaction(async (tx) => {
    const created = await refiningOrders.create({ refiner_id, direction: 'buy' }, tx)
    await refiningLots.assign(created.id, lot_ids, tx)
    return created.id
  })

  return await send(id)
}

// The "Create Sale" action: a finalized customer PURCHASE order's lots become a
// refiner SELL order. It obeys the pooling mechanic rather than fighting it -
// lots accumulate onto the one open sell order per refiner, so a second call for
// the same refiner adds to that order instead of being refused (GAP 9).
export async function sellToRefiner(
  order_id: string,
  refiner_id: string
): Promise<RefiningOrderView> {
  rules.assertPurchaseOrder(await ordersRepo.directionOf(order_id), order_id)
  rules.assertFinalizedOrder(await ordersRepo.getOne(order_id), order_id)
  const refiner = await refiners.viewOne(refiner_id)
  rules.assertRefiner(refiner, refiner_id)

  const lot_ids = (await orderLots.getFor(order_id)).map((row) => row.lot_id)
  rules.assertSuppliable(lot_ids, order_id)
  rules.assertUnassigned(await refiningLots.getByLots(lot_ids), lot_ids)

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
