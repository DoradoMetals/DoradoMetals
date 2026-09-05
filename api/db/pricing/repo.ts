import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import {
  CheckoutQuote,
  Direction,
  OrderPricing,
  ProductQuote,
  PriceSide,
  ProfitBreakdown,
  PurchaseQuote,
  SaleQuote,
} from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export async function directionOf(
  checkout_id: string,
  executor?: Executor
): Promise<Direction | undefined> {
  const { rows } = await query<{ direction: Direction }>(sql('direction'), [checkout_id], executor)
  return rows[0] ? Direction.parse(rows[0].direction) : undefined
}

export async function productQuote(
  bullion_id: string,
  side: PriceSide,
  quantity: number,
  executor?: Executor
): Promise<ProductQuote | undefined> {
  const { rows } = await query<{ quote: unknown }>(
    sql('product_quote'),
    [bullion_id, side, quantity],
    executor
  )
  return rows[0] ? ProductQuote.parse(rows[0].quote) : undefined
}

export async function purchaseQuote(
  checkout_id: string,
  executor?: Executor
): Promise<CheckoutQuote | undefined> {
  const { rows } = await query<{ quote: unknown }>(sql('purchase_quote'), [checkout_id], executor)
  return rows[0] ? PurchaseQuote.parse(rows[0].quote) : undefined
}

export async function saleQuote(
  checkout_id: string,
  collecting_nexus_taxes: boolean,
  executor?: Executor
): Promise<CheckoutQuote | undefined> {
  const { rows } = await query<{ quote: unknown }>(
    sql('sale_quote'),
    [checkout_id, collecting_nexus_taxes],
    executor
  )
  return rows[0] ? SaleQuote.parse(rows[0].quote) : undefined
}

export async function orderPricing(
  order_id: string,
  executor?: Executor
): Promise<OrderPricing | undefined> {
  const { rows } = await query<{ pricing: unknown }>(sql('order_pricing'), [order_id], executor)
  return rows[0] ? OrderPricing.parse(rows[0].pricing) : undefined
}

export async function profitBreakdown(
  order_id: string,
  executor?: Executor
): Promise<ProfitBreakdown | undefined> {
  const { rows } = await query<{ breakdown: unknown }>(
    sql('profit_breakdown'),
    [order_id],
    executor
  )
  return rows[0] ? ProfitBreakdown.parse(rows[0].breakdown) : undefined
}
