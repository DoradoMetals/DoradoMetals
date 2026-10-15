import { createElement as h } from 'react'
import { Hero, Table, band } from '@dorado/components/document'
import type { OrderPricing, QuoteEstimateInput } from '@dorado/contracts'
import { documentHtml } from '#documents/pdfs/render/documents/page.ts'
import { documentRows } from '#documents/pdfs/render/documents/rows.ts'
import { gettingPaid, howToSend } from '#documents/pdfs/render/documents/send-and-paid.ts'
import { qrDataUri } from '#documents/pdfs/render/qr.ts'
import { sellUrl } from '#documents/emails/links.ts'
import {
  formatCurrency,
  formatQuoted,
  formatSpotsAt,
  quoteNumber,
} from '#documents/pdfs/render/format.ts'

const DISCLAIMER =
  'This is an estimate, not an offer to purchase at this price. Your final payout is subject to spot volatility and assay results.'

function spotLine(pricing: OrderPricing): string {
  const quoted = pricing.spots
    .filter((spot) => spot.bid !== null)
    .map((spot) => `${spot.metal_id.toLowerCase()} ${formatCurrency(spot.bid)}`)
  const listed =
    quoted.length > 1 ? `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)}` : quoted.join('')
  const at = `Priced against spot on ${formatSpotsAt(pricing.spots_at)}`
  return listed ? `${at}: ${listed} per oz.` : `${at}.`
}

export function buildQuoteEstimateHtml({
  order,
  pricing,
  fees,
  parties,
}: QuoteEstimateInput): string {
  const quotedAt = new Date()
  const contact = parties?.contact ?? null
  return documentHtml({
    title: 'Quote Estimate',
    kind: 'Quote Estimate',
    reference: null,
    density: 'roomy',
    footDensity: 'compact',
    checkout: { title: 'Start your order', note: 'Scan with your phone', qr: qrDataUri(sellUrl()) },
    contact: [contact?.address, contact?.phone, contact?.email].filter(
      (part): part is string => typeof part === 'string' && part !== ''
    ),
    body: [
      h(Hero, {
        label: 'Estimated quote',
        value: formatCurrency(pricing.items_total),
        status: `${spotLine(pricing)} ${DISCLAIMER}`,
        reference: {
          number: `Quote ${quoteNumber(quotedAt)}`,
          customer: null,
        },
      }),
      h(Table, {
        cap: 'Items',
        column: 'Estimate',
        rows: documentRows(order.lots, pricing, 'quote'),
        closed: false,
      }),
      h('section', { key: 'send', style: band }, howToSend()),
      h('section', { key: 'paid', style: band }, gettingPaid(fees)),
    ],
    footer: formatQuoted(quotedAt),
  })
}
