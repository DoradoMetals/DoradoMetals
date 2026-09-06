import * as ordersRepo from '#db/orders/repo.ts'
import * as itemsRepo from '#db/orders/items/repo.ts'
import * as orderSpots from '#db/orders/spots/repo.ts'
import * as orderTransactions from '#db/orders/transactions/repo.ts'
import * as orderTransactionsService from '#orders/transactions/service.ts'
import * as refinerSpots from '#db/refiners/spots/repo.ts'
import * as refinerOrders from '#db/refiners/orders/repo.ts'
import * as packagesRepo from '#db/shipping/packages/repo.ts'

import * as refinerService from '#orders/refiners/service.ts'
import * as shipmentService from '#logistics/shipping/shipments/service.ts'
import * as carrierServices from '#logistics/shipping/services/service.ts'
import * as shippingLabels from '#logistics/shipping/labels.ts'
import * as emailService from '#documents/emails/service.ts'
import * as documentInputs from '#documents/pdfs/order-inputs.ts'
import * as credit from '#transactions/credit/service.ts'
import * as ledger from '#transactions/ledger/service.ts'
import * as orderRead from '#orders/read.ts'
import * as orderSpotsService from '#orders/spots/service.ts'
import * as rules from '#orders/rules.ts'
import * as shippingRules from '#logistics/shipping/rules.ts'
import * as pricing from '#pricing/index.ts'

import withTransaction from '#shared/db/withTransaction.ts'
import type { Transport } from '#providers/emails/nodemailer.ts'
import type { Executor } from '#shared/db/executor.ts'
import type {
  OrderCancelBody,
  OrderItemPatch,
  OrderPatch,
  OrderView,
  OrderItem,
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
      await itemsRepo.update(line.id, { premium: line.retier_premium }, {}, executor),
      order_id,
      line.id
    )
  }
}

export async function linesFor(order_id: string): Promise<OrderItem[]> {
  return await itemsRepo.getFor(order_id)
}

export async function createLine(order_id: string, input: OrderItemPatch): Promise<OrderItem> {
  rules.assertDirection(await ordersRepo.directionOf(order_id), 'purchase', 'adding a line')

  return await withTransaction(async (tx) => {
    const created = input.bullion_id
      ? await createFromCatalogue(order_id, input.bullion_id, tx)
      : await itemsRepo.create(order_id, rules.declaredLot(input), tx)
    await refinerService.mirrorLinesForOrder(order_id, tx)
    await retierPremiums(order_id, tx)
    return (await itemsRepo.getOne(created.id, tx)) ?? created
  })
}

async function createFromCatalogue(order_id: string, bullion_id: string, tx: Executor) {
  const created = await itemsRepo.createFromProduct(order_id, bullion_id, tx)
  rules.assertCatalogueProduct(created, bullion_id)
  return created
}

export async function editLine(line_id: string, changes: OrderItemPatch): Promise<OrderItem> {
  rules.assertNamesAField(changes)
  const line = await itemsRepo.getOne(line_id)
  rules.assertLine(line, line_id)

  return await withTransaction(async (tx) => {
    // The content is a fact of the row that RESULTS, so it is derived from that
    // row by one SQL statement rather than from a merge guessed here - and only
    // for a scrap lot. A catalogue line's content is the product's own fine
    // content, and re-deriving it as post_melt x purity applied the purity a
    // second time on every patch, confirming a line included (MP F1).
    const patched = await itemsRepo.update(line_id, changes, { order_id: line.order_id }, tx)
    rules.assertLine(patched, line_id)
    rules.assertWeighable(
      patched.bullion_id,
      patched.unit,
      patched.post_melt ?? patched.pre_melt,
      patched.purity
    )
    const written = (await itemsRepo.deriveContent(line_id, tx)) ?? patched
    if (!rules.retiersAfterEdit(changes)) return written
    await retierPremiums(line.order_id, tx)
    return (await itemsRepo.getOne(line_id, tx)) ?? written
  })
}

export async function removeLine(line_id: string): Promise<{ success: true }> {
  const line = await itemsRepo.getOne(line_id)
  rules.assertLine(line, line_id)

  await withTransaction(async (tx) => {
    const removed = await itemsRepo.remove(line_id, line.order_id, tx)
    rules.assertRemoved(removed, line.order_id, line_id)
    await retierPremiums(line.order_id, tx)
  })

  return { success: true }
}

export async function finalizePricing(order_id: string): Promise<OrderView> {
  const order = await viewOf(order_id)
  rules.assertDirection(order.order.direction, 'purchase', 'finalizing pricing')
  rules.assertAllLinesConfirmed(order.items, order.order.number)

  await withTransaction(async (tx) => {
    if (!order.order.spots_locked) await orderSpotsService.applyLock(order_id, true, tx)
    for (const spot of await orderSpots.getRowsFor(order_id, tx)) {
      await refinerSpots.update(order_id, spot.metal_id, { bid: spot.bid }, tx)
    }
    await ordersRepo.update(order_id, { spots_locked: true }, {}, tx)

    const priced = await pricing.priceOrder(order_id, tx)
    for (const line of priced.items) {
      await itemsRepo.update(line.id, { price: line.unit_price }, { order_id }, tx)
    }
    await orderTransactions.update(order_id, { total: priced.total }, {}, tx)
  })

  return await viewOf(order_id)
}

export async function addFunds(order_id: string): Promise<OrderView> {
  const order = await viewOf(order_id)
  rules.assertDirection(order.order.direction, 'purchase', 'adding funds')

  const amount = order.totals?.total ?? null
  rules.assertCreditable(amount, order.order.number)
  rules.assertPayableToAccount(order.payout?.method ?? null, order.order.number)

  await withTransaction(async (tx) => {
    // Read the ledger INSIDE the transaction that writes it: the view's
    // `credited` turns the button off, and this is what makes a second POST -
    // or two at once - refuse rather than credit the customer twice (MP F4).
    rules.assertNotAlreadyCredited(await ledger.hasCreditFor(order_id, tx), order.order.number)
    await credit.addFunds(order.order.user_id, amount, tx)
    await ledger.addTransactionLog(
      { user_id: order.order.user_id, type: 'Credit', order_id, amount },
      tx
    )
  })

  // The money has moved and the ledger row is committed. Telling the customer
  // is the next thing, and it happens outside the transaction on purpose.
  await orderTransactionsService.payoutRecorded(order_id)

  return await viewOf(order_id)
}

export async function cancel(
  order_id: string,
  { carrier_service_id, package_id }: OrderCancelBody,
  buy: (shipment_id: string) => Promise<void> = shippingLabels.buyReturnLabel
): Promise<OrderView> {
  const order = await viewOf(order_id)
  rules.assertDirection(order.order.direction, 'purchase', 'cancelling')
  rules.assertReturnable(order)

  const box = await packagesRepo.getOne(package_id)
  shippingRules.assertParcelPackage(box)
  const service = await carrierServices.labelServiceFor(carrier_service_id)
  // The floor is what the customer declared on the way in, so metal cancelled
  // before it was priced does not travel back uninsured (MP F5).
  const declaredValue = await shippingLabels.returnDeclaredValue(
    order_id,
    order.totals?.total ?? null,
    service.code
  )
  const insured = declaredValue > 0

  const shipment_id = await withTransaction(async (tx) => {
    await orderSpotsService.applyLock(order_id, false, tx)
    return await shipmentService.returnLeg(
      order_id,
      {
        package_id,
        carrier_service_id,
        insured,
        declared_value: insured ? declaredValue : null,
      },
      tx
    )
  })

  // null is a pickup or an appointment order: it is cancelled, and there is no
  // parcel to post back (LD F4).
  if (shipment_id) await buy(shipment_id)

  return await viewOf(order_id)
}

export async function sendToRefiner(
  order_id: string,
  refiner_id: string,
  transport?: Transport
): Promise<OrderView> {
  const order = await viewOf(order_id)
  rules.assertDirection(order.order.direction, 'sale', 'sending to a refiner')

  const refiner = await refinerService.getRefinerFromId(refiner_id)
  const engagement = await refinerOrders.findByOrder(order_id)
  rules.assertSendable(
    order,
    refiner_id,
    engagement?.refiner_id ?? null,
    refiner?.organization?.email
  )

  if (order.order.order_sent !== true) {
    await withTransaction(async (tx) => {
      const engagementId = await refinerService.engagementIdFor(order_id, tx)
      rules.assertRefinerAttached(
        await refinerOrders.update(engagementId, { refiner_id }, tx),
        order_id
      )
      await shipmentService.create(order_id, 'Outbound', tx)
      await ordersRepo.update(order_id, { order_sent: true }, {}, tx)
    })
  }

  await emailService.sendSalesOrderToSupplier(
    await documentInputs.salesOrderInvoiceInputs(order_id),
    refiner!.organization!.email!,
    transport
  )

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
