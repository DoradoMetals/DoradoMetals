import { createElement as h } from 'react'
import { Pair, type LedgerLine } from '@dorado/components/document'
import type { OrderView, OrderPricing, PartiesDocumentInput } from '@dorado/contracts'
import { buildManifestHtml } from '#documents/pdfs/render/documents/manifest.ts'
import { documentRows } from '#documents/pdfs/render/documents/rows.ts'
import { shippingPair } from '#documents/pdfs/render/documents/shipment-manifest.ts'
import {
  formatCurrency,
  formatSpotsAt,
  formatIssued,
  minus,
} from '#documents/pdfs/render/format.ts'

function purchaseSummary(pricing: OrderPricing): { ledger: LedgerLine[]; total: string } {
  return {
    ledger: [
      { label: 'Items', value: formatCurrency(pricing.items_total) },
      { label: 'Shipping', value: minus(pricing.shipping_charge) },
      { label: 'Payout', value: minus(pricing.payout_fee) },
    ],
    total: formatCurrency(pricing.total),
  }
}

function saleSummary(order: OrderView): { ledger: LedgerLine[]; total: string } {
  const t = order.totals
  const ledger: LedgerLine[] = [
    { label: 'Items', value: formatCurrency(t?.items) },
    { label: 'Shipping', value: formatCurrency(t?.shipping) },
  ]
  if (t?.used_funds) ledger.push({ label: 'Credit applied', value: minus(t?.funds) })
  if ((t?.surcharge ?? 0) > 0)
    ledger.push({ label: 'Card fee', value: formatCurrency(t?.surcharge) })
  if ((t?.sales_tax ?? 0) > 0)
    ledger.push({ label: 'Sales Tax', value: formatCurrency(t?.sales_tax) })
  return { ledger, total: formatCurrency(t?.total) }
}

function paymentPair({ order, parties }: PartiesDocumentInput) {
  const payout = order.payout
  if (payout) {
    return h(Pair, {
      cap: 'Payment',
      left: {
        label: 'ACCOUNT',
        who: payout.account_type
          ? `${payout.account_type} ••••${payout.account_last4 ?? '----'}`
          : '-',
        lines: [payout.account_holder_name, payout.bank_name],
      },
      right: parties?.payout ?? { label: 'METHOD', who: '-', lines: [] },
    })
  }
  const payment = parties?.payment ?? null
  if (payment === null) return null
  const card = parties?.card ?? null
  return h(Pair, {
    cap: 'Payment',
    left: {
      label: 'ACCOUNT',
      who: card?.who ?? order.user?.name ?? '-',
      lines: card === null ? [] : [order.user?.name ?? null],
    },
    right: payment,
  })
}

export function buildInvoiceHtml(input: PartiesDocumentInput): string {
  const { order, pricing } = input
  const isSale = order.order.direction === 'sale'
  const { ledger, total } = isSale ? saleSummary(order) : purchaseSummary(pricing)
  const noun = isSale ? 'order total' : 'payout amount'

  return buildManifestHtml({
    title: `${isSale ? 'Sales Invoice' : 'Invoice'} ${order.reference}`,
    eyebrow: isSale ? 'Sales Invoice' : 'Order Invoice',
    reference: order.reference,
    heroLabel: isSale ? 'Order total' : 'Total payout',
    heroValue: total,
    heroStatus: `Final agreed upon ${noun}. Priced against spots locked at ${formatSpotsAt(pricing.spots_at)}.`,
    middle: isSale
      ? [
          h('div', { key: 'payment' }, paymentPair(input)),
          h('div', { key: 'shipping' }, shippingPair(order, 'sale', null)),
        ]
      : paymentPair(input),
    tableCap: 'Items',
    tableColumn: isSale ? 'Total' : 'Payout',
    rows: documentRows(order.lots, pricing, 'post', isSale),
    ledger,
    total,
    footer: formatIssued(),
  })
}
