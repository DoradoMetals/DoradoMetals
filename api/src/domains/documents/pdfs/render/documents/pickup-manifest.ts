import { createElement as h } from 'react'
import { Pair } from '@dorado/components/document'
import type { PartiesDocumentInput } from '@dorado/contracts'
import {
  buildManifestHtml,
  ESTIMATE_HERO_LABEL,
  ESTIMATE_HERO_STATUS,
} from '#documents/pdfs/render/documents/manifest.ts'
import { documentRows } from '#documents/pdfs/render/documents/rows.ts'
import { customerBlock } from '#documents/pdfs/render/documents/parties.ts'
import { timedEnd } from '#shared/text/time.ts'
import { formatCurrency, formatCreated, minus } from '#documents/pdfs/render/format.ts'

function pickupPair({ order, parties }: PartiesDocumentInput) {
  return h(Pair, {
    cap: 'Pickup',
    left: customerBlock(order, 'CUSTOMER', 'visit'),
    right: timedEnd(parties?.pickup ?? { label: 'PICKUP', who: 'To be confirmed', lines: [] }),
  })
}

export function buildPickupManifestHtml(input: PartiesDocumentInput): string {
  const { order, pricing } = input
  return buildManifestHtml({
    title: `Pickup Manifest ${order.reference}`,
    eyebrow: 'Pickup Manifest',
    reference: order.reference,
    heroLabel: ESTIMATE_HERO_LABEL,
    heroValue: formatCurrency(pricing.total),
    heroStatus: ESTIMATE_HERO_STATUS,
    middle: pickupPair(input),
    tableCap: 'Items expected',
    tableColumn: 'Estimate',
    rows: documentRows(order.lots, pricing, 'pre'),
    ledger: [
      { label: 'Items', value: formatCurrency(pricing.items_total) },
      { label: 'Pickup', value: minus(pricing.shipping_charge) },
      { label: 'Payout', value: minus(pricing.payout_fee) },
    ],
    total: formatCurrency(pricing.total),
    footer: formatCreated(),
  })
}
