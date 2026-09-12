import { createElement as h } from 'react'
import { Pair, type LedgerLine } from '@dorado/components/document'
import type { OrderView, OrderPricing, DocumentInput } from '@dorado/contracts'
import { buildManifestHtml } from '#documents/pdfs/render/documents/manifest.ts'
import { documentRows } from '#documents/pdfs/render/documents/rows.ts'
import {
  formatCurrency,
  formatSpotsAt,
  formatIssued,
  getPayoutDelay,
} from '#documents/pdfs/render/format.ts'

const minus = (value: number | null | undefined): string =>
  value == null ? '-' : `-${formatCurrency(value)}`

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
    { label: 'Shipping', value: minus(t?.shipping) },
  ]
  if (t?.used_funds) ledger.push({ label: 'Credit Applied', value: minus(t?.funds) })
  if ((t?.surcharge ?? 0) > 0)
    ledger.push({ label: 'Payment Fee', value: formatCurrency(t?.surcharge) })
  if ((t?.sales_tax ?? 0) > 0)
    ledger.push({ label: 'Sales Tax', value: formatCurrency(t?.sales_tax) })
  return { ledger, total: formatCurrency(t?.total) }
}

function paymentPair(order: OrderView) {
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
      right: {
        label: 'METHOD',
        who: payout.method ?? '-',
        lines: [getPayoutDelay(payout.method)],
      },
    })
  }
  const credit = order.totals?.used_funds === true
  return h(Pair, {
    cap: 'Payment',
    left: {
      label: 'ACCOUNT',
      who: credit ? 'Account credit' : 'Card',
      lines: [order.user?.name ?? null],
    },
    right: {
      label: 'METHOD',
      who: credit ? 'Store credit' : 'Card payment',
      lines: ['Paid in full'],
    },
  })
}

export function buildInvoiceHtml({ order, pricing }: DocumentInput): string {
  const isSale = order.order.direction === 'sale'
  const { ledger, total } = isSale ? saleSummary(order) : purchaseSummary(pricing)
  const noun = isSale ? 'order total' : 'payout amount'

  return buildManifestHtml({
    title: `Invoice ${order.reference}`,
    eyebrow: 'Invoice',
    reference: order.reference,
    heroLabel: isSale ? 'Order total' : 'Total payout',
    heroValue: total,
    heroStatus: `Final agreed upon ${noun}. Priced against spots locked at ${formatSpotsAt(pricing.spots_at)}.`,
    middle: paymentPair(order),
    rows: documentRows(order.lots, pricing),
    ledger,
    total,
    issued: formatIssued(),
  })
}
