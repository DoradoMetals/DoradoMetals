import * as ordersRepo from '#db/orders/repo.ts'
import * as orderLots from '#db/orders/lots/repo.ts'
import * as lotsRepo from '#db/lots/items/repo.ts'
import * as orderSpots from '#db/orders/spots/repo.ts'
import * as orderTransactions from '#db/orders/transactions/repo.ts'
import * as orderTransactionsService from '#orders/transactions/service.ts'
import * as packagesRepo from '#db/shipping/packages/repo.ts'
import * as carrierServicesRepo from '#db/shipping/services/repo.ts'
import * as pdfs from '#db/media/pdfs/repo.ts'

import * as fulfillmentService from '#logistics/fulfillments/service.ts'
import * as shipmentService from '#logistics/shipping/shipments/service.ts'
import * as carrierServices from '#logistics/shipping/services/service.ts'
import * as shippingLabels from '#logistics/shipping/labels.ts'
import * as credit from '#transactions/credit/service.ts'
import * as ledger from '#transactions/ledger/service.ts'
import * as orderRead from '#orders/read.ts'
import * as orderSpotsService from '#orders/spots/service.ts'
import * as rules from '#orders/rules.ts'
import * as shippingRules from '#logistics/shipping/rules.ts'
import * as pricing from '#pricing/index.ts'
import * as accounts from '#accounts/auth/step-up.ts'

import withTransaction from '#shared/db/withTransaction.ts'
import type { Executor } from '#shared/db/executor.ts'
import type {
  LotSplitPart,
  OrderCancelBody,
  OverrideBody,
  OrderDocument,
  OrderLotPatch,
  OrderLotView,
  OrderPatch,
  OrderView,
  LotView,
} from '@dorado/contracts'

export async function patch(order_id: string, changes: OrderPatch): Promise<OrderView> {
  rules.assertNamesAField(changes)
  const written = await withTransaction((tx) => ordersRepo.update(order_id, changes, {}, tx))
  rules.assertOrder(written || null, order_id)
  return await viewOf(order_id)
}

async function viewOf(order_id: string): Promise<OrderView> {
  const order = await orderRead.view(order_id)
  rules.assertOrder(order, order_id)
  return order
}

export async function retierPremiums(order_id: string, executor?: Executor): Promise<void> {
  if ((await ordersRepo.directionOf(order_id, executor)) !== 'purchase') return
  for (const line of (await pricing.priceOrder(order_id, executor)).items) {
    if (line.retier_premium === null) continue
    rules.assertRepriced(
      await orderLots.update(line.id, { premium: line.retier_premium }, executor),
      order_id,
      line.id
    )
  }
}

export async function lotsFor(order_id: string): Promise<OrderLotView[]> {
  return await orderLots.viewFor(order_id)
}

export async function addLot(order_id: string, input: OrderLotPatch): Promise<OrderLotView> {
  rules.assertDirection(await ordersRepo.directionOf(order_id), 'purchase', 'adding a lot')

  const id = await withTransaction(async (tx) => {
    const lot = input.bullion_id
      ? await mintFromCatalogue(input.bullion_id, input.quantity ?? null, tx)
      : await lotsRepo.create(rules.declaredLot(input), tx)
    const link = await orderLots.link(order_id, lot.id, tx)
    await retierPremiums(order_id, tx)
    return link.id
  })

  const written = (await orderLots.viewFor(order_id)).find((row) => row.id === id)
  rules.assertLot(written, id)
  return written
}

async function mintFromCatalogue(bullion_id: string, quantity: number | null, tx: Executor) {
  const created = await lotsRepo.createFromProduct(bullion_id, quantity, false, tx)
  rules.assertCatalogueProduct(created, bullion_id)
  return created
}

export async function editLot(id: string, changes: OrderLotPatch): Promise<OrderLotView> {
  rules.assertNamesAField(changes)
  const link = await orderLots.getOne(id)
  rules.assertLot(link, id)
  const lot = await lotsRepo.getOne(link.lot_id)
  rules.assertLot(lot, link.lot_id)

  const money = rules.lotMoney(changes)
  const facts = rules.lotFacts(changes)
  rules.assertWeighable(
    facts.bullion_id ?? lot.bullion_id,
    facts.unit ?? lot.unit,
    facts.post_melt ?? facts.pre_melt ?? lot.post_melt ?? lot.pre_melt,
    facts.purity ?? lot.purity
  )

  await withTransaction(async (tx) => {
    if (rules.namesAnyOf(money)) rules.assertLot(await orderLots.update(id, money, tx), id)
    if (rules.namesAnyOf(facts)) {
      rules.assertLot(await lotsRepo.update(link.lot_id, facts, tx), link.lot_id)
    }
    if (rules.retiersAfterEdit(changes)) await retierPremiums(link.order_id, tx)
  })

  const written = (await orderLots.viewFor(link.order_id)).find((row) => row.id === id)
  rules.assertLot(written, id)
  return written
}

export async function removeLot(id: string): Promise<void> {
  const link = await orderLots.getOne(id)
  rules.assertLot(link, id)

  await withTransaction(async (tx) => {
    rules.assertRemoved(await orderLots.remove(id, tx), link.order_id, id)
    await lotsRepo.remove(link.lot_id, tx)
    await retierPremiums(link.order_id, tx)
  })
}

export async function finalize(order_id: string): Promise<OrderView> {
  const order = await viewOf(order_id)
  rules.assertFinalizable(order)

  await withTransaction(async (tx) => {
    if (!order.order.spots_locked) await orderSpotsService.applyLock(order_id, true, tx)
    await ordersRepo.update(order_id, { spots_locked: true }, {}, tx)

    const priced = await pricing.priceOrder(order_id, tx)
    for (const line of priced.items) {
      await orderLots.update(line.id, { price: line.unit_price }, tx)
    }
    await orderTransactions.update(order_id, { total: priced.total }, {}, tx)
  })

  return await viewOf(order_id)
}

export async function reopen(order_id: string): Promise<OrderView> {
  const order = await viewOf(order_id)
  rules.assertReopenable(order)
  await withTransaction((tx) => ordersRepo.update(order_id, { cancelled_at: null }, {}, tx))
  return await viewOf(order_id)
}

export async function documentsFor(order_id: string): Promise<OrderDocument[]> {
  const order = await viewOf(order_id)
  return rules.documentsFor(
    await fulfillmentService.categoryOfOrder(order_id),
    rules.isFinalized(order),
    await pdfs.storedKinds(order_id, null)
  )
}

export async function addFunds(
  order_id: string,
  body: OverrideBody = {},
  session_id: string | null = null
): Promise<OrderView> {
  const order = await viewOf(order_id)
  rules.assertDirection(order.order.direction, 'purchase', 'adding funds')

  const amount = order.totals?.total ?? null
  rules.assertCreditable(amount, order.order.number)
  rules.assertPayableToAccount(order.payout?.method ?? null, order.order.number)

  if (await ledger.hasCreditFor(order_id)) {
    rules.assertCreditOverride(true, body.override_reason, order.order.number)
    await accounts.assertSteppedUp(session_id)
  }

  await withTransaction(async (tx) => {
    await credit.addFunds(order.order.user_id, amount, tx)
    await ledger.addTransactionLog(
      { user_id: order.order.user_id, type: 'Credit', order_id, amount },
      tx
    )
  })

  await orderTransactionsService.payoutRecorded(order_id)

  return await viewOf(order_id)
}

export async function cancel(
  order_id: string,
  choices: OrderCancelBody,
  buy: (shipment_id: string) => Promise<void> = shippingLabels.buyReturnLabel
): Promise<OrderView> {
  const order = await viewOf(order_id)
  rules.assertDirection(order.order.direction, 'purchase', 'cancelling')
  rules.assertReturnable(order)

  const box = choices.package_id
    ? await packagesRepo.getOne(choices.package_id)
    : await packagesRepo.defaultReturn()
  shippingRules.assertParcelPackage(box)
  const chosenService = choices.carrier_service_id
    ? null
    : await carrierServicesRepo.defaultReturn()
  rules.assertReturnService(choices.carrier_service_id ?? chosenService?.id ?? null)
  const carrier_service_id = (choices.carrier_service_id ?? chosenService?.id) as string
  const package_id = box.id
  const service = await carrierServices.labelServiceFor(carrier_service_id)
  const declaredValue = await shippingLabels.returnDeclaredValue(
    order_id,
    order.totals?.total ?? null,
    service.code
  )
  const insured = declaredValue > 0

  const shipment_id = await withTransaction(async (tx) => {
    await orderSpotsService.applyLock(order_id, false, tx)
    await ordersRepo.update(order_id, { cancelled_at: new Date().toISOString() }, {}, tx)
    return await shipmentService.returnLeg(
      order_id,
      {
        package_id,
        carrier_service_id,
        insured,
        declared_value: insured ? declaredValue : null,
        bill_return_to_customer: choices.bill_return_to_customer,
      },
      tx
    )
  })

  if (shipment_id) await buy(shipment_id)

  return await viewOf(order_id)
}

export async function updateTracking(
  order_id: string,
  tracking_number: string
): Promise<{ success: true }> {
  const shipment = await shipmentService.getByOrder(order_id)
  rules.assertShipmentToTrack(shipment, order_id)

  await withTransaction(async (tx) => {
    await shipmentService.update(shipment.id, { tracking_number }, tx)
    await ordersRepo.update(order_id, { tracking_updated: true }, {}, tx)
  })
  return { success: true }
}
