import { AdoptAssayBody, AdoptAssayProposal } from '@dorado/contracts'
import * as ordersRepo from '#db/orders/repo.ts'
import * as orderLots from '#db/orders/lots/repo.ts'
import * as lotsRepo from '#db/inventory/lots/repo.ts'
import * as lotSourcesRepo from '#db/inventory/lot-sources/repo.ts'
import * as orderSpots from '#db/orders/spots/repo.ts'
import * as payoutMethods from '#db/orders/payout-methods/repo.ts'
import * as lotUnlinks from '#db/orders/lot-unlinks/repo.ts'
import * as transfers from '#db/payments/transfers/repo.ts'
import * as paymentMethods from '#db/payments/methods/repo.ts'
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
import * as paymentDetails from '#transactions/details/service.ts'
import * as orderRead from '#orders/read.ts'
import * as orderSpotsService from '#orders/spots/service.ts'
import * as rules from '#orders/rules.ts'
import * as shippingRules from '#logistics/shipping/rules.ts'
import * as pricing from '#pricing/index.ts'
import * as accounts from '#accounts/auth/step-up.ts'
import * as refiningService from '#refining/service.ts'
import * as inventoryService from '#inventory/service.ts'

import withTransaction from '#shared/db/withTransaction.ts'
import { attempt } from '#shared/attempt.ts'
import * as actionReasons from '#db/orders/action-reasons/repo.ts'
import * as paymentsService from '#transactions/service.ts'
import * as sweeps from '#transactions/sweeps.ts'
import * as shippingOperations from '#logistics/shipping/operations/service.ts'
import type { Executor } from '#shared/db/executor.ts'
import type {
  AdminLot,
  LotSplitPart,
  OrderCancelBody,
  OverrideBody,
  OrderDocument,
  OrderLotPatch,
  OrderLotView,
  OrderPatch,
  OrderView,
  PayoutMethodsPutBody,
  LotUnlinkBody,
  LotView,
  Lot,
} from '@dorado/contracts'

export async function patch(
  order_id: string,
  changes: OrderPatch,
  expected_updated_at: string | null = null
): Promise<OrderView> {
  rules.assertNamesAField(changes)
  if (changes.cancelled_at !== undefined) {
    rules.assertClearsCancellation(changes.cancelled_at)
    rules.assertReopenable(await viewOf(order_id))
  }
  const written = await withTransaction(async (tx) => {
    const current = await ordersRepo.getOne(order_id, tx)
    rules.assertOrder(current, order_id)
    rules.assertFresh(current.updated_at, expected_updated_at, `order ${current.number}`)
    return await ordersRepo.update(order_id, changes, {}, tx)
  })
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
    const link = await orderLots.getOne(line.id, executor)
    rules.assertLot(link, line.id)
    rules.assertRepriced(
      await lotsRepo.update(link.lot_id, { premium: line.retier_premium }, executor),
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
    await orderSpotsService.coverMetals(order_id, 'lot added', tx)
    await retierPremiums(order_id, tx)
    return link.id
  })

  const written = (await orderLots.viewFor(order_id)).find((row) => row.id === id)
  rules.assertLot(written, id)
  return written
}

export async function linkAdminLots(
  order_id: string,
  lots: AdminLot[],
  tx: Executor
): Promise<void> {
  const overrides: { id: string; premium: number }[] = []
  for (const declared of lots) {
    const lot =
      'bullion_id' in declared && declared.bullion_id
        ? await mintFromCatalogue(declared.bullion_id, declared.quantity ?? null, tx)
        : await lotsRepo.create(rules.declaredLot(declared as OrderLotPatch), tx)
    await orderLots.link(order_id, lot.id, tx)
    if (declared.premium !== undefined) overrides.push({ id: lot.id, premium: declared.premium })
  }
  await orderSpotsService.coverMetals(order_id, 'lot added', tx)
  await retierPremiums(order_id, tx)
  for (const { id, premium } of overrides) {
    await lotsRepo.update(id, { premium, premium_override: true }, tx)
  }
}

async function mintFromCatalogue(bullion_id: string, quantity: number | null, tx: Executor) {
  const created = await lotsRepo.createFromProduct(bullion_id, quantity, false, tx)
  rules.assertCatalogueProduct(created, bullion_id)
  return created
}

export async function guardChargedSale(
  order_id: string,
  override_reason: string | null | undefined,
  session_id: string | null,
  what: string
): Promise<string | null> {
  const facts = await viewOf(order_id)
  rules.assertChargedSaleOverride(facts, override_reason, what)
  if (!rules.chargedSale(facts)) return null
  await accounts.assertSteppedUp(session_id)
  return override_reason as string
}

export async function recordActionReason(
  order_id: string,
  action: string,
  reason: string | null,
  tx: Executor
): Promise<void> {
  if (reason === null) return
  await actionReasons.create({ order_id, action, reason }, tx)
}

export async function editLot(
  id: string,
  changes: OrderLotPatch,
  expected_updated_at: string | null = null,
  override_reason: string | null = null,
  session_id: string | null = null
): Promise<OrderLotView | Lot> {
  rules.assertNamesAField(changes)
  const link = await orderLots.getOne(id)
  if (!link) return await refiningService.recordAssay(id, changes)
  const overridden = await guardChargedSale(
    link.order_id,
    override_reason,
    session_id,
    'editing a lot'
  )

  const lot = await lotsRepo.getOne(link.lot_id)
  rules.assertLot(lot, link.lot_id)
  rules.assertWeighable(
    changes.bullion_id ?? lot.bullion_id,
    changes.unit ?? lot.unit,
    changes.post_melt ?? changes.pre_melt ?? lot.post_melt ?? lot.pre_melt,
    changes.purity ?? lot.purity
  )

  await withTransaction(async (tx) => {
    const current = await lotsRepo.getOne(link.lot_id, tx)
    rules.assertLot(current, link.lot_id)
    rules.assertFresh(current.updated_at, expected_updated_at, `lot ${link.lot_id}`)
    rules.assertLot(await lotsRepo.update(link.lot_id, changes, tx), link.lot_id)
    await recordActionReason(link.order_id, 'edit_lot', overridden, tx)
    if (changes.metal_id) await orderSpotsService.coverMetals(link.order_id, 'lot edited', tx)
    if (changes.image_id) await inventoryService.coverImage(link.lot_id, changes.image_id, tx)
    if (rules.retiersAfterEdit(changes)) await retierPremiums(link.order_id, tx)
  })

  const written = (await orderLots.viewFor(link.order_id)).find((row) => row.id === id)
  rules.assertLot(written, id)
  return written
}

export async function assignStockLot(order_id: string, lot_id: string): Promise<OrderLotView> {
  rules.assertDirection(await ordersRepo.directionOf(order_id), 'sale', 'assigning a stock lot')
  const positions = await lotsRepo.positionsOf([lot_id])
  rules.assertOnHand(positions[0]?.position, lot_id)

  const minted = await withTransaction((tx) => orderLots.mintFromStock(order_id, lot_id, tx))

  const written = (await orderLots.viewFor(order_id)).find((row) => row.id === minted.id)
  rules.assertLot(written, minted.id)
  return written
}

export async function adoptAssayProposal(order_id: string): Promise<AdoptAssayProposal> {
  return AdoptAssayProposal.parse(await orderLots.adoptAssayProposal(order_id))
}

export async function adoptAssay(order_id: string, body: AdoptAssayBody): Promise<OrderLotView[]> {
  rules.assertDirection(await ordersRepo.directionOf(order_id), 'purchase', 'adopting an assay')
  const links = await orderLots.getFor(order_id)
  for (const entry of body.lots) {
    rules.assertLot(
      links.find((row) => row.id === entry.id),
      entry.id
    )
  }

  await withTransaction(async (tx) => {
    for (const entry of body.lots) {
      const link = links.find((row) => row.id === entry.id)!
      rules.assertLot(await lotsRepo.update(link.lot_id, entry.figures, tx), link.lot_id)
    }
    await orderSpotsService.coverMetals(order_id, 'refiner assay adopted', tx)
  })

  if (body.combine !== false) {
    const lot_ids = body.lots.map((entry) => links.find((row) => row.id === entry.id)!.lot_id)
    const edges = await lotSourcesRepo.sourcesOf(lot_ids)
    const refinerLotIds = new Set(
      edges.filter((edge) => edge.kind === 'batch').map((edge) => edge.lot_id)
    )
    for (const refinerLotId of refinerLotIds) {
      const group = edges
        .filter((edge) => edge.kind === 'batch' && edge.lot_id === refinerLotId)
        .map((edge) => edge.source_lot_id)
        .filter((source_lot_id) => lot_ids.includes(source_lot_id))
      if (group.length <= 1) continue

      const combined = await inventoryService.combine(group)
      const groupLinks = links.filter((row) => group.includes(row.lot_id))
      await withTransaction(async (tx) => {
        for (const groupLink of groupLinks) await orderLots.remove(groupLink.id, tx)
        await orderLots.link(order_id, combined.id, tx)
      })
    }
  }

  return await orderLots.viewFor(order_id)
}

export async function unlinkLot(
  id: string,
  body: LotUnlinkBody,
  session_id: string | null = null
): Promise<OrderLotView[]> {
  const link = await orderLots.getOne(id)
  rules.assertLot(link, id)
  const sale = (await ordersRepo.directionOf(link.order_id)) === 'sale'
  const overridden = sale
    ? await guardChargedSale(link.order_id, body.override_reason, session_id, 'removing a line')
    : null
  if (!sale) {
    const [position] = await lotsRepo.positionsOf([link.lot_id])
    const edges = await lotSourcesRepo.sourcesOf([link.lot_id])
    rules.assertUnlinkable(position?.position, edges, link.lot_id)
  }

  await withTransaction(async (tx) => {
    rules.assertRemoved(await orderLots.remove(id, tx), link.order_id, id)
    await lotUnlinks.create(
      { order_id: link.order_id, lot_id: link.lot_id, reason: body.reason },
      tx
    )
    await recordActionReason(link.order_id, 'unlink_lot', overridden, tx)
    if (!sale) await retierPremiums(link.order_id, tx)
  })

  return await orderLots.viewFor(link.order_id)
}

export async function finalize(order_id: string): Promise<OrderView> {
  const order = await viewOf(order_id)
  rules.assertFinalizable(order)

  await withTransaction(async (tx) => {
    if (!order.order.spots_locked) await orderSpotsService.applyLock(order_id, true, tx)
    await ordersRepo.update(order_id, { spots_locked: true }, {}, tx)

    const priced = await pricing.priceOrder(order_id, tx)
    await orderTransactions.update(order_id, { total: priced.total }, {}, tx)
  })

  return await viewOf(order_id)
}

export async function documentsFor(order_id: string): Promise<OrderDocument[]> {
  const order = await viewOf(order_id)
  return rules.documentsFor(
    await fulfillmentService.categoryOfOrder(order_id),
    order.order.direction,
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

  const shares = await payoutMethods.shares(order_id)
  const amount = shares.split ? shares.account : (order.totals?.total ?? null)
  rules.assertCreditable(amount, order.order.number)
  if (!shares.split) rules.assertPayableToAccount(order.payout?.method ?? null, order.order.number)

  if (await ledger.hasCreditFor(order_id)) {
    rules.assertCreditOverride(true, body.override_reason, order.order.number)
    await accounts.assertSteppedUp(session_id)
  }

  await withTransaction(async (tx) => {
    await credit.lockBalance(order.order.user_id, tx)
    rules.assertCreditOverride(
      await ledger.hasCreditFor(order_id, tx),
      body.override_reason,
      order.order.number
    )
    await credit.addFunds(order.order.user_id, amount, tx)
    await ledger.addTransactionLog(
      { user_id: order.order.user_id, type: 'Credit', order_id, amount },
      tx
    )
  })

  await orderTransactionsService.payoutRecorded(order_id)

  return await viewOf(order_id)
}

export async function setPayoutMethods(
  order_id: string,
  body: PayoutMethodsPutBody
): Promise<OrderView> {
  const order = await viewOf(order_id)
  rules.assertDirection(order.order.direction, 'purchase', 'splitting a payout')
  const standing = await transfers.getForOrder(order_id, 'payout')
  if (rules.choosesOneMethod(body.methods)) {
    return await chooseOneMethod(order, body.methods[0]!.method_id, standing?.state ?? null)
  }
  rules.assertSplitEditable(order, standing?.state ?? null)
  const known = await paymentMethods.list()
  const types = body.methods.map(
    (line) => known.find((method) => method.id === line.method_id)?.type ?? null
  )
  rules.assertSplitShape(
    body.methods,
    types,
    pricing.payoutSplitGapCents(
      body.methods.map((row) => row.amount ?? 0),
      order.totals.total
    ),
    order.order.number
  )

  await withTransaction(async (tx) => {
    await payoutMethods.removeFor(order_id, tx)
    for (const line of body.methods) await payoutMethods.create(order_id, line, tx)
    const transfer = types.find((type) => type !== 'DORADO_ACCOUNT')
    const details_id = order.totals.payout_details_id
    if (transfer && details_id) await paymentDetails.setMethod(details_id, transfer, tx)
  })

  return await viewOf(order_id)
}

async function chooseOneMethod(
  order: OrderView,
  method_id: string,
  payout_state: string | null
): Promise<OrderView> {
  const details_id = rules.assertOneMethodChangeable(order, payout_state)
  const method = await paymentMethods.getOne(method_id)
  rules.assertPayoutMethod(method, method_id)

  await withTransaction(async (tx) => {
    await payoutMethods.removeFor(order.order.id, tx)
    await paymentDetails.setMethod(details_id, method.type, tx)
  })

  return await viewOf(order.order.id)
}

export async function cancel(
  order_id: string,
  choices: OrderCancelBody,
  buy: (shipment_id: string) => Promise<void> = shippingLabels.buyReturnLabel
): Promise<OrderView> {
  const order = await viewOf(order_id)
  if (order.order.direction === 'sale') return await cancelSale(order_id, choices)
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

export const SALE_CANCEL_WORLD = {
  openIntentRefFor: paymentsService.openIntentRefFor,
  cancelIntent: paymentsService.cancelIntentByRef,
  voidLabel: (shipment_id: string) =>
    shippingOperations.cancelLabel({ shipment_id, carrier_id: undefined }).then(() => undefined),
}

export async function cancelSale(
  order_id: string,
  choices: OrderCancelBody,
  world: typeof SALE_CANCEL_WORLD = SALE_CANCEL_WORLD
): Promise<OrderView> {
  const order = await viewOf(order_id)
  rules.assertDirection(order.order.direction, 'sale', 'cancelling a sale')
  rules.assertReasonGiven(choices.reason, `cancelling order ${order.order.number}`)

  await withTransaction(async (tx) => {
    await ordersRepo.lock(order_id, tx)
    const current = await orderRead.view(order_id, tx)
    rules.assertOrder(current, order_id)
    rules.assertSaleCancellable(current)
    await sweeps.cancelPendingSale(order_id, tx)
    await actionReasons.create({ order_id, action: 'cancel', reason: choices.reason as string }, tx)
  })

  const intent_ref = await world.openIntentRefFor(order_id)
  if (intent_ref) {
    await attempt(`cancel intent of order ${order_id}`, () => world.cancelIntent(intent_ref))
  }
  for (const shipment of order.shipments) {
    if (shipment.direction !== 'Outbound' || !shipment.tracking_number) continue
    await attempt(`void label of shipment ${shipment.id}`, () => world.voidLabel(shipment.id))
  }

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
