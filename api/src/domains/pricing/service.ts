import * as pricing from '#db/pricing/repo.ts'
import * as spotsRepo from '#db/spots/repo.ts'
import * as lotsRepo from '#db/lots/items/repo.ts'
import * as rules from '#pricing/rules.ts'
import type { Executor } from '#shared/db/executor.ts'
import type {
  CheckoutQuote,
  InventoryMetal,
  OrderPricing,
  PriceSide,
  ProductQuote,
  ProfitBreakdown,
  SpotPrice,
} from '@dorado/contracts'

export async function spots(executor?: Executor): Promise<SpotPrice[]> {
  return await spotsRepo.list(executor)
}

export async function inventoryMetals(executor?: Executor): Promise<InventoryMetal[]> {
  return await lotsRepo.inventoryByMetal(executor)
}

export async function priceProduct(
  bullion_id: string,
  side: PriceSide,
  quantity = 1,
  executor?: Executor
): Promise<ProductQuote> {
  const quote = await pricing.productQuote(bullion_id, side, quantity, executor)
  rules.assertPriced(quote, `product ${bullion_id}`)
  return quote
}

export async function priceCheckout(
  checkout_id: string,
  executor?: Executor
): Promise<CheckoutQuote> {
  const direction = await pricing.directionOf(checkout_id, executor)
  rules.assertPriced(direction, `checkout ${checkout_id}`)

  const quote =
    direction === 'sale'
      ? await pricing.saleQuote(checkout_id, executor)
      : await pricing.purchaseQuote(checkout_id, executor)
  rules.assertPriced(quote, `checkout ${checkout_id}`)
  rules.assertPriceable(quote.unpriceable, `checkout ${checkout_id}`)
  return quote
}

export async function priceOrder(order_id: string, executor?: Executor): Promise<OrderPricing> {
  const pricingRow = await pricing.orderPricing(order_id, executor)
  rules.assertPriced(pricingRow, `order ${order_id}`)
  rules.assertPriceable(pricingRow.unpriceable, `order ${order_id}`)
  return pricingRow
}

export async function profitBreakdown(
  order_id: string,
  executor?: Executor
): Promise<ProfitBreakdown> {
  const breakdown = await pricing.profitBreakdown(order_id, executor)
  rules.assertPriced(breakdown, `order ${order_id}`)
  return breakdown
}
