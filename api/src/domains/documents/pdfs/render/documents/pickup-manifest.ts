import { createElement as h } from 'react'
import { Pair } from '@dorado/components/document'
import type { OrderView, OrderPricing, DocumentInput } from '@dorado/contracts'
import {
  buildManifestHtml,
  ESTIMATE_HERO_LABEL,
  ESTIMATE_HERO_STATUS,
} from '#documents/pdfs/render/documents/manifest.ts'
import { documentRows } from '#documents/pdfs/render/documents/rows.ts'
import { customerBlock } from '#documents/pdfs/render/documents/parties.ts'
import { formatCurrency, formatIssued, formatSlot } from '#documents/pdfs/render/format.ts'

function pickupPair(order: OrderView) {
  return h(Pair, {
    cap: 'Pickup',
    left: customerBlock(order, 'CUSTOMER'),
    right: {
      label: 'PICKUP',
      who: order.pickup?.requested_at ? formatSlot(order.pickup.requested_at) : '-',
      lines: [order.pickup?.location ?? null],
    },
  })
}

export function buildPickupManifestHtml({ order, pricing }: DocumentInput): string {
  return buildManifestHtml({
    title: `Pickup Manifest ${order.reference}`,
    eyebrow: 'Pickup Manifest',
    reference: order.reference,
    heroLabel: ESTIMATE_HERO_LABEL,
    heroValue: formatCurrency(pricing.total),
    heroStatus: ESTIMATE_HERO_STATUS,
    middle: pickupPair(order),
    rows: documentRows(order.lots, pricing),
    ledger: [
      { label: 'Items', value: formatCurrency(pricing.items_total) },
      { label: 'Pickup', value: `-${formatCurrency(pricing.shipping_charge)}` },
      { label: 'Payout', value: `-${formatCurrency(pricing.payout_fee)}` },
    ],
    total: formatCurrency(pricing.total),
    issued: formatIssued(),
  })
}
