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
import { formatCurrency, formatIssued } from '#documents/pdfs/render/format.ts'

function shippingPair(order: OrderView, isReturn: boolean, box: DocumentPackage | null) {
  const shipment = isReturn ? returnShipment(order) : inboundShipment(order)
  const customer = customerBlock(order, isReturn ? 'TO' : 'FROM')
  const dorado = doradoBlock(isReturn ? 'FROM' : 'TO')
  const boxFact =
    box?.label && box.length != null && box.width != null && box.height != null
      ? `${box.label} (${box.length}×${box.width}×${box.height} in)`
      : null

  return h(Pair, {
    cap: 'Shipping',
    facts: [
      shipment?.service_name ?? null,
      shipment?.tracking_number ?? null,
      shipment?.insured ? `Insured for ${formatCurrency(shipment.declared_value)}` : null,
      boxFact,
    ],
    left: isReturn ? dorado : customer,
    right: isReturn ? customer : dorado,
    connector: true,
  })
}

function build(eyebrow: string, isReturn: boolean, input: ShipmentManifestInput): string {
  const { order, pricing, package: box = null } = input
  return buildManifestHtml({
    title: `${eyebrow} ${order.reference}`,
    eyebrow,
    reference: order.reference,
    heroLabel: ESTIMATE_HERO_LABEL,
    heroValue: formatCurrency(pricing.total),
    heroStatus: ESTIMATE_HERO_STATUS,
    middle: shippingPair(order, isReturn, box),
    rows: documentRows(order.lots, pricing),
    ledger: [
      { label: 'Items', value: formatCurrency(pricing.items_total) },
      { label: 'Shipping', value: `-${formatCurrency(pricing.shipping_charge)}` },
      { label: 'Payout', value: `-${formatCurrency(pricing.payout_fee)}` },
    ],
    total: formatCurrency(pricing.total),
    issued: formatIssued(),
  })
}

export function buildPackingListHtml(input: ShipmentManifestInput): string {
  return build('Shipment Manifest', false, input)
}

export function buildReturnPackingListHtml(input: ShipmentManifestInput): string {
  return build('Shipment Manifest', true, input)
}
