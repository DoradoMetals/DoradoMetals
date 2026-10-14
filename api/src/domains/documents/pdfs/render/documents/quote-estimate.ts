import { createElement as h } from 'react'
import { Hero, Table, band } from '@dorado/components/document'
import type { QuoteEstimateInput } from '@dorado/contracts'
import { documentHtml } from '#documents/pdfs/render/documents/page.ts'
import { documentRows } from '#documents/pdfs/render/documents/rows.ts'
import { gettingPaid, howToSend } from '#documents/pdfs/render/documents/send-and-paid.ts'
import { qrDataUri } from '#documents/pdfs/render/qr.ts'
import { sellUrl } from '#documents/emails/links.ts'
import { formatCurrency, formatQuoted, formatSpotsAt } from '#documents/pdfs/render/format.ts'

const ABOUT =
  'This is an estimate, not an offer to purchase: prices move with spot, and your final payout is set by assay on arrival, so weight and purity can differ from what is declared. Shipping and payout fees are not included.'

export function buildQuoteEstimateHtml({ order, pricing, fees }: QuoteEstimateInput): string {
  return documentHtml({
    title: 'Quote Estimate',
    kind: 'Quote Estimate',
    reference: null,
    density: 'roomy',
    footDensity: 'compact',
    checkout: { title: 'Start your order', note: 'Scan with your phone', qr: qrDataUri(sellUrl()) },
    body: [
      h(Hero, {
        label: 'Estimated quote',
        value: formatCurrency(pricing.items_total),
        status: `Priced against spot at ${formatSpotsAt(pricing.spots_at)}. ${ABOUT}`,
      }),
      h(Table, {
        cap: 'Items',
        column: 'Estimate',
        rows: documentRows(order.lots, pricing, 'post'),
        closed: false,
      }),
      h('section', { key: 'send', style: band }, howToSend()),
      h('section', { key: 'paid', style: band }, gettingPaid(fees)),
    ],
    footer: formatQuoted(),
  })
}
