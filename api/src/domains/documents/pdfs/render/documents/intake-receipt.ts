import { createElement as h } from 'react'
import { Pair } from '@dorado/components/document'
import type { PartiesDocumentInput } from '@dorado/contracts'
import {
  buildManifestHtml,
  ESTIMATE_HERO_LABEL,
  ESTIMATE_HERO_STATUS,
} from '#documents/pdfs/render/documents/manifest.ts'
import { documentRows } from '#documents/pdfs/render/documents/rows.ts'
import { timedEnd } from '#shared/text/time.ts'
import { formatCurrency, formatCreated, minus } from '#documents/pdfs/render/format.ts'

function appointmentPair({ parties }: PartiesDocumentInput) {
  return h(Pair, {
    cap: 'Appointment',
    left: parties?.office ?? { label: 'OFFICE', who: 'Dorado Metals Exchange', lines: [] },
    right: timedEnd(
      parties?.appointment ?? { label: 'APPOINTMENT', who: 'To be confirmed', lines: [] }
    ),
  })
}

export function buildIntakeReceiptHtml(input: PartiesDocumentInput): string {
  const { order, pricing } = input
  return buildManifestHtml({
    title: `Intake Receipt ${order.reference}`,
    eyebrow: 'Intake Receipt',
    reference: order.reference,
    heroLabel: ESTIMATE_HERO_LABEL,
    heroValue: formatCurrency(pricing.total),
    heroStatus: ESTIMATE_HERO_STATUS,
    middle: appointmentPair(input),
    tableCap: 'Items expected',
    tableColumn: 'Estimate',
    rows: documentRows(order.lots, pricing, 'manifest'),
    ledger: [
      { label: 'Items', value: formatCurrency(pricing.items_total) },
      { label: 'Handling', value: minus(pricing.shipping_charge) },
      { label: 'Payout', value: minus(pricing.payout_fee) },
    ],
    total: formatCurrency(pricing.total),
    footer: formatCreated(),
  })
}
