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

function appointmentPair(order: OrderView) {
  return h(Pair, {
    cap: 'Appointment',
    left: customerBlock(order, 'CUSTOMER'),
    right: {
      label: 'APPOINTMENT',
      who: order.pickup?.requested_at ? formatSlot(order.pickup.requested_at) : '-',
      lines: [order.pickup?.location ?? null],
    },
  })
}

export function buildIntakeReceiptHtml({ order, pricing }: DocumentInput): string {
  return buildManifestHtml({
    title: `Intake Receipt ${order.reference}`,
    eyebrow: 'Intake Receipt',
    reference: order.reference,
    heroLabel: ESTIMATE_HERO_LABEL,
    heroValue: formatCurrency(pricing.total),
    heroStatus: ESTIMATE_HERO_STATUS,
    middle: appointmentPair(order),
    rows: documentRows(order.lots, pricing),
    ledger: [
      { label: 'Items', value: formatCurrency(pricing.items_total) },
      { label: 'Handling', value: `-${formatCurrency(pricing.shipping_charge)}` },
      { label: 'Payout', value: `-${formatCurrency(pricing.payout_fee)}` },
    ],
    total: formatCurrency(pricing.total),
    issued: formatIssued(),
  })
}
