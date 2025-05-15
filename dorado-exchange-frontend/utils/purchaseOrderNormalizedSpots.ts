import { SpotPrice } from "@/types/metal"

export function getPurchaseOrderNormalizedSpotPrices(
  orderSpotPrices: SpotPrice[],
  globalSpotPrices: SpotPrice[]
): SpotPrice[] {
  const map = new Map<string, SpotPrice>()

  // Step 1: Populate with global prices
  for (const metal of globalSpotPrices) {
    map.set(metal.type, metal)
  }
  console.log('global spots: ', map)
  // Step 2: Override with order-specific prices
  for (const metal of orderSpotPrices) {
    const fallback = map.get(metal.type)
    map.set(metal.type, {
      id: metal.id,
      type: metal.type,
      ask_spot: metal.ask_spot ?? fallback?.ask_spot ?? 0,
      bid_spot: metal.bid_spot ?? fallback?.bid_spot ?? 0,
      percent_change: metal.percent_change ?? fallback?.percent_change ?? 0,
      dollar_change: metal.dollar_change ?? fallback?.dollar_change ?? 0,
      scrap_percentage: metal.scrap_percentage ?? fallback?.scrap_percentage ?? 0,
      purchase_order_id: metal.purchase_order_id,
      sales_order_id: metal.sales_order_id,
      created_at: metal.created_at ?? fallback?.created_at,
      updated_at: metal.updated_at ?? fallback?.updated_at,
    })
  }

  return Array.from(map.values())
}