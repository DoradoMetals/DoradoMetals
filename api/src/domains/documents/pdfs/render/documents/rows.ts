import type { TableRow } from '@dorado/components/document'
import type { OrderLotView, OrderPricing, OrderPricingLine } from '@dorado/contracts'
import {
  formatCurrency,
  labelled,
  moneyFact,
  ounces,
  pctFact,
  percent,
  priceFact,
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

function weighed(
  line: OrderLotView,
  layout: 'invoice' | 'manifest' | 'sale' | 'quote'
): number | null {
  return layout === 'manifest'
    ? (line.lot.pre_melt ?? line.lot.post_melt)
    : (line.lot.post_melt ?? line.lot.pre_melt)
}

function scrapRow(
  line: OrderLotView,
  name: string,
  pricing: OrderPricing,
  layout: 'invoice' | 'manifest' | 'sale' | 'quote'
): TableRow {
  const price = priceFor(pricing.items, line)
  const weight = weightFact(weighed(line, layout), line.lot.unit)
  return {
    name,
    figure: formatCurrency(price?.line_total),
    facts:
      layout === 'quote'
        ? [
            weight,
            labelled('Purity', percent(line.lot.purity)),
            labelled(`${line.lot.metal_id} weight`, ounces(price?.fine)),
            priceFact(price?.oz_price, 'per oz', price?.premium ?? line.lot.premium),
          ]
        : [
            weight,
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
  layout: 'invoice' | 'manifest' | 'sale' | 'quote'
): TableRow {
  const price = priceFor(pricing.items, line)
  const rateOf = price?.premium ?? line.lot.premium
  return {
    name,
    figure: formatCurrency(price?.line_total),
    facts:
      layout === 'quote'
        ? [
            labelled('Quantity', String(line.lot.quantity)),
            labelled(`${line.lot.metal_id} weight`, ounces(price?.fine)),
            priceFact(price?.unit_price, 'each', rateOf),
          ]
        : [
            unitsFact(line.lot.quantity),
            layout === 'sale' ? moneyFact(price?.unit_price, 'each') : rateFact(rateOf, 'premium'),
            moneyFact(spotFor(pricing, line), 'spot'),
          ],
  }
}

export function documentRows(
  lines: OrderLotView[],
  pricing: OrderPricing,
  layout: 'invoice' | 'manifest' | 'sale' | 'quote' = 'invoice'
): TableRow[] {
  return lines.map((line) =>
    isBullion(line)
      ? bullionRow(line, named(lines, line), pricing, layout)
      : scrapRow(line, named(lines, line), pricing, layout)
  )
}
