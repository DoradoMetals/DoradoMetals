import { SpotPrice } from '@/types/metal'
import { Product } from '@/types/product'
import { PaymentMethodType, SalesOrderTotals } from '@/types/sales-orders'

export function calculateCardCharge(orderTotal: number): number {
  return orderTotal * 0.029
}

export function calculateItemTotals(items: Product[], spots: SpotPrice[] = []): number {
  return items.reduce((acc, item) => {
    const spot = spots.find((s) => s.type === item.metal_type)
    const unitPrice = (item.content ?? 0) * ((spot?.ask_spot ?? 0) * (item.ask_premium ?? 0))
    const qty = item.quantity ?? 1
    return acc + unitPrice * qty
  }, 0)
}

export function calculateSalesOrderPrices(
  items: Product[],
  usingFunds: boolean,
  spots: SpotPrice[],
  funds: number,
  serviceCost: number,
  paymentMethod: PaymentMethodType,
  salesTax: number,
): SalesOrderTotals {
  const itemTotal = calculateItemTotals(items, spots)
  const shippingCharge = itemTotal > 1000 ? 0 : serviceCost
  const baseTotal = itemTotal + shippingCharge + salesTax

  const beginningFunds = funds
  const appliedFunds = usingFunds ? Math.min(beginningFunds, baseTotal) : 0
  const endingFunds = beginningFunds - appliedFunds

  const subjectToChargesAmount = baseTotal - appliedFunds

  let postChargesAmount = subjectToChargesAmount
  let subchargeAmount = 0
  if (paymentMethod !== 'CREDIT') {
    postChargesAmount += calculateCardCharge(subjectToChargesAmount)
    subchargeAmount = postChargesAmount - subjectToChargesAmount
  }

  const orderTotal = appliedFunds + postChargesAmount

  return {
    itemTotal,
    baseTotal,
    shippingCharge,
    beginningFunds,
    appliedFunds,
    endingFunds,
    subjectToChargesAmount,
    postChargesAmount,
    subchargeAmount,
    salesTax,
    orderTotal,
  }
}
