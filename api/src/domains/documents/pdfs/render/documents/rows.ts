import type { TableRow } from '@dorado/components/document'
import type { OrderLotView, OrderPricing, OrderPricingLine } from '@dorado/contracts'
import {
  formatCurrency,
  moneyFact,
  pctFact,
  rateFact,
  unitsFact,
  weightFact,
} from '#documents/pdfs/render/format.ts'

const priceFor = (prices: OrderPricingLine[], line: OrderLotView): OrderPricingLine | undefined =>
  prices.find((p) => p.id === line.id)

function spotFor(pricing: OrderPricing, line: OrderLotView): number | null {
  const quoted = pricing.spots.find((s) => s.metal_id === line.lot.metal_id)
  return (
    priceFor(pricing.items, line)?.spot ??
    (pricing.direction === 'sale' ? quoted?.ask : quoted?.bid) ??
    null
  )
}

function named(lines: OrderLotView[], line: OrderLotView): string {
  const twins = lines.filter((other) => other.name === line.name).length
  return twins > 1 && line.lot.reference ? `${line.name} · ${line.lot.reference}` : line.name
}

const isBullion = (line: OrderLotView): boolean => line.lot.bullion_id !== null

function melted(line: OrderLotView, melt: 'pre' | 'post'): number | null {
  return melt === 'post'
    ? (line.lot.post_melt ?? line.lot.pre_melt)
    : (line.lot.pre_melt ?? line.lot.post_melt)
}

function scrapRow(
  line: OrderLotView,
  name: string,
  pricing: OrderPricing,
  melt: 'pre' | 'post'
): TableRow {
  const price = priceFor(pricing.items, line)
  return {
    name,
    figure: formatCurrency(price?.line_total),
    facts: [
      weightFact(melted(line, melt), line.lot.unit, `${melt} melt`),
      pctFact(line.lot.purity, 'purity'),
      rateFact(price?.premium ?? line.lot.premium, 'premium'),
      moneyFact(spotFor(pricing, line), 'spot'),
    ],
  }
}

function bullionRow(
  line: OrderLotView,
  name: string,
  pricing: OrderPricing,
  sale: boolean
): TableRow {
  const price = priceFor(pricing.items, line)
  return {
    name,
    figure: formatCurrency(price?.line_total),
    facts: [
      unitsFact(line.lot.quantity),
      sale
        ? moneyFact(price?.unit_price, 'each')
        : rateFact(price?.premium ?? line.lot.premium, 'premium'),
      moneyFact(spotFor(pricing, line), 'spot'),
    ],
  }
}

export function documentRows(
  lines: OrderLotView[],
  pricing: OrderPricing,
  melt: 'pre' | 'post' = 'post',
  sale = false
): TableRow[] {
  return lines.map((line) =>
    isBullion(line)
      ? bullionRow(line, named(lines, line), pricing, sale)
      : scrapRow(line, named(lines, line), pricing, melt)
  )
}
