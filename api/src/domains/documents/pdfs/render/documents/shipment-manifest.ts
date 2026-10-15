import { createElement as h } from 'react'
import { Pair } from '@dorado/components/document'
import type { OrderView, DocumentPackage, ShipmentManifestInput } from '@dorado/contracts'
import {
  buildManifestHtml,
  ESTIMATE_HERO_LABEL,
  ESTIMATE_HERO_STATUS,
} from '#documents/pdfs/render/documents/manifest.ts'
import { documentRows } from '#documents/pdfs/render/documents/rows.ts'
import {
  inboundShipment,
  returnShipment,
  customerBlock,
  doradoBlock,
} from '#documents/pdfs/render/documents/parties.ts'
import {
  formatAmount,
  formatCurrency,
  formatCreated,
  minus,
} from '#documents/pdfs/render/format.ts'

export function shippingPair(
  order: OrderView,
  leg: 'inbound' | 'return' | 'sale',
  box: DocumentPackage | null
) {
  const isReturn = leg === 'return'
  const outward = leg !== 'inbound'
  const shipment = isReturn ? returnShipment(order) : inboundShipment(order)
  const customer = customerBlock(order, outward ? 'TO' : 'FROM', leg === 'sale' ? 'quiet' : 'ship')
  const dorado = doradoBlock(outward ? 'FROM' : 'TO', leg !== 'sale')
  const boxFact =
    box?.label && box.length != null && box.width != null && box.height != null
      ? `${box.label} (${box.length}×${box.width}×${box.height} in)`
      : null

  return h(Pair, {
    cap: 'Shipment',
    facts: [
      shipment?.service_name ?? null,
      shipment?.tracking_number ?? null,
      shipment?.insured ? `Insured for ${formatAmount(shipment.declared_value)}` : null,
      boxFact,
    ],
    left: outward ? dorado : customer,
    right: outward ? customer : dorado,
    connector: true,
  })
}

function build(eyebrow: string, leg: 'inbound' | 'return', input: ShipmentManifestInput): string {
  const { order, pricing, package: box = null } = input
  return buildManifestHtml({
    title: `${eyebrow} ${order.reference}`,
    eyebrow,
    reference: order.reference,
    heroLabel: ESTIMATE_HERO_LABEL,
    heroValue: formatCurrency(pricing.total),
    heroStatus: ESTIMATE_HERO_STATUS,
    middle: shippingPair(order, leg, box),
    tableCap: 'Items enclosed',
    tableColumn: 'Estimate',
    rows: documentRows(order.lots, pricing, 'manifest'),
    ledger: [
      { label: 'Items', value: formatCurrency(pricing.items_total) },
      { label: 'Shipping', value: minus(pricing.shipping_charge) },
      { label: 'Payout', value: minus(pricing.payout_fee) },
    ],
    total: formatCurrency(pricing.total),
    footer: formatCreated(),
  })
}

export function buildPackingListHtml(input: ShipmentManifestInput): string {
  return build('Shipment Manifest', 'inbound', input)
}

export function buildReturnPackingListHtml(input: ShipmentManifestInput): string {
  return build('Shipment Manifest', 'return', input)
}
