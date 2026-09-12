import type { TableRow } from '@dorado/components/document'
import type {
  OrderLotView,
  OrderPricing,
  OrderPricingLine,
  OrderPricingSpot,
} from '@dorado/contracts'
import {
  formatCurrency,
  weightFact,
  pctFact,
  unitsFact,
  moneyFact,
} from '#documents/pdfs/render/format.ts'

const priceFor = (prices: OrderPricingLine[], line: OrderLotView): OrderPricingLine | undefined =>
  prices.find((p) => p.id === line.id)

const spotFor = (spots: OrderPricingSpot[], metal_id: string): number | null =>
  spots.find((s) => s.metal_id === metal_id)?.bid ?? null

function scrapRow(line: OrderLotView, pricing: OrderPricing): TableRow {
  const price = priceFor(pricing.items, line)
  return {
    name: line.lot.reference ?? 'Scrap Item',
    figure: formatCurrency(price?.line_total),
    facts: [
      weightFact(line.lot.post_melt ?? line.lot.pre_melt, line.lot.unit, 'post melt'),
      pctFact(line.lot.purity, 'purity'),
      pctFact(line.lot.premium, 'premium'),
      moneyFact(spotFor(pricing.spots, line.lot.metal_id), 'spot'),
    ],
  }
}

function bullionRow(line: OrderLotView, pricing: OrderPricing): TableRow {
  const price = priceFor(pricing.items, line)
  return {
    name: line.lot.product_name || 'Bullion Product',
    figure: formatCurrency(price?.line_total),
    facts: [
      unitsFact(line.lot.quantity),
      pctFact(line.lot.premium, 'premium'),
      moneyFact(spotFor(pricing.spots, line.lot.metal_id), 'spot'),
    ],
  }
}

export function documentRows(lines: OrderLotView[], pricing: OrderPricing): TableRow[] {
  return lines.map((line) =>
    line.lot.bullion_id === null ? scrapRow(line, pricing) : bullionRow(line, pricing)
  )
}
