import { createElement as h } from 'react'
import { Hero, NextStep, Note, Table } from '@dorado/components/document'
import type { DocumentInput } from '@dorado/contracts'
import { documentHtml } from '#documents/pdfs/render/documents/page.ts'
import { documentRows } from '#documents/pdfs/render/documents/rows.ts'
import { qrDataUri } from '#documents/pdfs/render/qr.ts'
import { sellUrl } from '#documents/emails/links.ts'
import { formatCurrency, formatQuoted, formatSpotsAt } from '#documents/pdfs/render/format.ts'

const ABOUT =
  'This is an estimate, not an offer to purchase. Prices move with spot, and your final payout is set by assay on arrival, so weight and purity can differ from what is declared. Shipping and payout fees are not included.'

function shown(url: string): string {
  const parsed = new URL(url)
  return `${parsed.host.replace(/^www\./, '')}${parsed.pathname}`
}

export function buildQuoteEstimateHtml({ order, pricing }: DocumentInput): string {
  const sell = sellUrl()
  return documentHtml({
    title: 'Quote Estimate',
    kind: 'Quote Estimate',
    reference: order.user?.name ?? null,
    density: 'roomy',
    footDensity: 'compact',
    body: [
      h(Hero, {
        label: 'Estimated quote',
        value: formatCurrency(pricing.items_total),
        status: `Priced against spot at ${formatSpotsAt(pricing.spots_at)}.`,
      }),
      h(Table, {
        cap: 'Items',
        column: 'Estimate',
        rows: documentRows(order.lots, pricing, 'post'),
      }),
      h(NextStep, {
        cap: 'Next step',
        title: 'Start your order',
        body: `Scan the code or go to ${shown(sell)} to turn this quote into an order, then choose how to send your items: ship, pickup or appointment.`,
        qr: qrDataUri(sell),
      }),
      h(Note, { cap: 'About this quote', body: ABOUT }),
    ],
    footer: formatQuoted(),
  })
}
