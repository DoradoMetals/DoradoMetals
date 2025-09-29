// utils/purchase-order-profit.ts
import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderTotals,
  ProfitCategoriesDict,
} from '@/types/purchase-order'
import { SpotPrice } from '@/types/metal'

type MetalName = 'Gold' | 'Silver' | 'Platinum' | 'Palladium'
type MetalKey = 'gold' | 'silver' | 'platinum' | 'palladium'

const METALS: MetalName[] = ['Gold', 'Silver', 'Platinum', 'Palladium']
const toKey = (m: MetalName): MetalKey => m.toLowerCase() as MetalKey

const emptyMetalsDict = () => ({
  gold: { content: 0, percentage: 0, profit: 0 },
  silver: { content: 0, percentage: 0, profit: 0 },
  platinum: { content: 0, percentage: 0, profit: 0 },
  palladium: { content: 0, percentage: 0, profit: 0 },
})

/** Safe accessors */
const getItemMetal = (item: PurchaseOrderItem): MetalName | null => {
  if (item.item_type === 'scrap') return (item.scrap?.metal ?? null) as MetalName | null
  if (item.item_type === 'product') return (item.product?.metal_type ?? null) as MetalName | null
  return null
}
const getItemContent = (item: PurchaseOrderItem): number => {
  if (item.item_type === 'scrap') return item.scrap?.content ?? 0
  if (item.item_type === 'product') {
    const c = item.product?.content ?? 0
    const q = item.product?.quantity ?? item.quantity ?? 1
    return c * q
  }
  return 0
}

/** Sum content by metal for a chosen category */
function sumContentByMetal(order: PurchaseOrder, category: 'scrap' | 'bullion' | 'total') {
  const totals = { Gold: 0, Silver: 0, Platinum: 0, Palladium: 0 } as Record<MetalName, number>

  for (const item of order.order_items) {
    const metal = getItemMetal(item)
    if (!metal) continue

    const isScrap = item.item_type === 'scrap'
    const isBullion = item.item_type === 'product'

    if ((category === 'scrap' && !isScrap) || (category === 'bullion' && !isBullion)) continue

    totals[metal] += getItemContent(item)
  }

  if (category === 'total') {
    // already counted above; nothing to filter
    // but if you want “total” explicitly, just re-run once more:
    const allTotals = { Gold: 0, Silver: 0, Platinum: 0, Palladium: 0 } as Record<MetalName, number>
    for (const item of order.order_items) {
      const metal = getItemMetal(item)
      if (!metal) continue
      allTotals[metal] += getItemContent(item)
    }
    return allTotals
  }

  return totals
}

/** Get a spot record by metal name */
const getSpot = (spots: SpotPrice[], metal: MetalName) =>
  spots.find((s) => s.type.toLowerCase() === metal.toLowerCase()) ?? null

/** Core: compute one category (scrap | bullion | total) */
function computeCategory(
  order: PurchaseOrder,
  category: 'scrap' | 'bullion' | 'total',
  orderSpots: SpotPrice[],
  refinerSpots: SpotPrice[]
): { categoryTotals: ProfitCategoriesDict; totalContent: number } {
  const byMetal = sumContentByMetal(order, category)
  const categoryTotals: ProfitCategoriesDict = {
    scrap: emptyMetalsDict(),
    bullion: emptyMetalsDict(),
    total: emptyMetalsDict(),
  }

  // Decide where to store (so the shape matches your UI expectations)
  const bucket = categoryTotals[category]

  // Sum across metals to compute per-metal percentage later
  const totalContent = (Object.values(byMetal) as number[]).reduce((a, b) => a + b, 0) || 0

  for (const metal of METALS) {
    const content = byMetal[metal] || 0
    const key = toKey(metal)

    // Rates as decimals (0–1). For bullion you can plug whatever policy you want.
    const orderSpot = getSpot(orderSpots, metal)
    const refSpot = getSpot(refinerSpots, metal)

    const doradoRate = (orderSpot?.scrap_percentage ?? 0) / 100
    const refinerRate = (refSpot?.scrap_percentage ?? 0) / 100

    const customerContent = content * doradoRate
    const refinerContent = content * refinerRate
    const doradoContent = Math.max(content - (customerContent + refinerContent), 0)

    // Dollar values
    const customerDollars = customerContent * (orderSpot?.bid_spot ?? 0)
    const refinerDollars = refinerContent * (refSpot?.bid_spot ?? 0)
    const doradoDollars = doradoContent * (refSpot?.bid_spot ?? 0)

    // Fill per-party sections
    // (You only asked for one table at a time; but this structure lets you compose later.)
    // For this layer we just store the “party” total in each category bucket,
    // and the UI will pick which party to show.

    // We’ll put the *combined* view inside `bucket` (content = total content for this metal in this category),
    // and percentage is metal share of category.
    bucket[key].content = content
    bucket[key].percentage = totalContent ? (content / totalContent) * 100 : 0
    // For “profit”, show Dorado dollars by default (what the business cares about most in this table).
    bucket[key].profit = doradoDollars

    // If you want all three parties broken out separately, you can also return them
    // or compute three different ProfitCategoriesDicts; see next function.
  }

  return { categoryTotals, totalContent }
}

/** Full “three-party” breakdown for one category */
function computeCategoryForAllParties(
  order: PurchaseOrder,
  category: 'scrap' | 'bullion' | 'total',
  orderSpots: SpotPrice[],
  refinerSpots: SpotPrice[]
) {
  const byMetal = sumContentByMetal(order, category)
  const totalContent = (Object.values(byMetal) as number[]).reduce((a, b) => a + b, 0) || 0

  const make = () => emptyMetalsDict()
  const customer = make()
  const refiner = make()
  const dorado = make()

  for (const metal of METALS) {
    const content = byMetal[metal] || 0
    const key = toKey(metal)
    const orderSpot = getSpot(orderSpots, metal)
    const refSpot = getSpot(refinerSpots, metal)
    const doradoRate = (orderSpot?.scrap_percentage ?? 0) / 100
    const refinerRate = (refSpot?.scrap_percentage ?? 0) / 100

    const custContent = content * doradoRate
    const refContent = content * refinerRate
    const dorContent = Math.max(content - (custContent + refContent), 0)

    // Percent of the category for each metal (same across parties)
    const pct = totalContent ? (content / totalContent) * 100 : 0

    customer[key] = {
      content: custContent,
      percentage: pct,
      profit: custContent * (orderSpot?.bid_spot ?? 0), // payout dollars
    }
    refiner[key] = {
      content: refContent,
      percentage: pct,
      profit: refContent * (refSpot?.bid_spot ?? 0),
    }
    dorado[key] = {
      content: dorContent,
      percentage: pct,
      profit: dorContent * (refSpot?.bid_spot ?? 0),
    }
  }

  return { customer, refiner, dorado, totalContent }
}

/** Public: compute everything you need for the page */
export function computePurchaseOrderTotals(
  order: PurchaseOrder,
  orderSpots: SpotPrice[],
  refinerSpots: SpotPrice[]
): PurchaseOrderTotals {
  // SCRAP – three-party view
  const scrap = computeCategoryForAllParties(order, 'scrap', orderSpots, refinerSpots)

  // BULLION – placeholder: uses the same function, but you may set different rates later
  const bullion = computeCategoryForAllParties(order, 'bullion', orderSpots, refinerSpots)

  // TOTAL – sum both categories (runs on 'total' for simplicity)
  const total = computeCategoryForAllParties(order, 'total', orderSpots, refinerSpots)

  return {
    total_content: total.totalContent,
    refiner: {
      scrap: scrap.refiner,
      bullion: bullion.refiner,
      total: total.refiner,
    },
    dorado: {
      scrap: scrap.dorado,
      bullion: bullion.dorado,
      total: total.dorado,
    },
    customer: {
      scrap: scrap.customer,
      bullion: bullion.customer,
      total: total.customer,
    },
  }
}
