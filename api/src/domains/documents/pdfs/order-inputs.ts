import * as orderRead from '#orders/read.ts'
import * as packagesRepo from '#db/shipping/packages/repo.ts'
import * as pdfsRepo from '#db/media/pdfs/repo.ts'
import * as pricing from '#pricing/index.ts'
import * as rules from '#documents/pdfs/rules.ts'
import type {
  AssayResultsDocument,
  OrderView,
  RateSheetDocument,
  DocumentPackage,
} from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const inboundShipment = (order: OrderView): OrderView['shipments'][number] | null =>
  order.shipments.find((s) => s.direction !== 'Return') ?? null

async function loadOrder(order_id: string, executor?: Executor): Promise<OrderView> {
  const order = await orderRead.view(order_id, executor)
  rules.assertOrder(order, order_id)
  return order
}

export async function packageDetailsFor(
  order: OrderView,
  executor?: Executor
): Promise<DocumentPackage | null> {
  const package_id = inboundShipment(order)?.package_id ?? null
  if (!package_id) return null
  const box = await packagesRepo.getOne(package_id, executor)
  if (!box) return null
  return {
    label: box.label,
    length: Number(box.length),
    width: Number(box.width),
    height: Number(box.height),
  }
}

export async function packingListInputs(order_id: string, executor?: Executor) {
  const order = await loadOrder(order_id, executor)
  return {
    order,
    pricing: await pricing.priceOrder(order_id, executor),
    package: await packageDetailsFor(order, executor),
  }
}

export async function returnPackingListInputs(order_id: string, executor?: Executor) {
  return packingListInputs(order_id, executor)
}

export async function invoiceInputs(order_id: string, executor?: Executor) {
  const order = await loadOrder(order_id, executor)
  return { order, pricing: await pricing.priceOrder(order_id, executor) }
}

export async function pickupManifestInputs(order_id: string, executor?: Executor) {
  return invoiceInputs(order_id, executor)
}

export async function intakeReceiptInputs(order_id: string, executor?: Executor) {
  return invoiceInputs(order_id, executor)
}

export async function referenceInputs(order_id: string, executor?: Executor): Promise<string> {
  const order = await loadOrder(order_id, executor)
  return order.reference
}

export async function assayResultsInputs(
  order_id: string,
  executor?: Executor
): Promise<AssayResultsDocument> {
  const doc = await pdfsRepo.assayResults(order_id, executor)
  rules.assertAssayResults(doc, order_id)
  return doc
}

export async function rateSheetInputs(executor?: Executor): Promise<RateSheetDocument> {
  return pdfsRepo.rateSheet(executor)
}
