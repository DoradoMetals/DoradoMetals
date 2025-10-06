import { PurchaseOrder, PurchaseOrderItem, PurchaseOrderTotals } from '@/types/purchase-order'
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

const getScrapActualContent = (item: PurchaseOrderItem): number | null => {
  if (item.item_type !== 'scrap' || !item.scrap) return null
  const s = item.scrap
  if (typeof s.content_actual === 'number') return s.content_actual
  if (typeof s.post_melt_actual === 'number' && typeof s.purity_actual === 'number') {
    return s.post_melt_actual * s.purity_actual
  }
  return null
}

const getSpot = (spots: SpotPrice[], metal: MetalName) =>
  spots.find((s) => s.type.toLowerCase() === metal.toLowerCase()) ?? null

type Shares = { customerShare: number; doradoShare: number; refinerShare: number }
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

function premiumsToShares(
  category: 'scrap' | 'bullion' | 'total',
  doradoPremium?: number | null,
  refinerPremium?: number | null
): Shares {
  let d = doradoPremium ?? undefined
  let r = refinerPremium ?? undefined

  if (d == null && r != null) d = r
  if (r == null && d != null) r = d

  if (d == null && r == null && (category === 'bullion' || category === 'total')) {
    return { customerShare: 1, doradoShare: 0, refinerShare: 0 }
  }

  if (d == null) d = 1
  if (r == null) r = 1

  d = clamp01(d)
  r = clamp01(r)

  let customerShare = d
  let doradoShare = Math.max(r - d, 0)
  let refinerShare = 1 - r

  const sum = customerShare + doradoShare + refinerShare
  if (Math.abs(sum - 1) > 1e-9) {
    const remainder = Math.max(1 - customerShare, 0)
    const dr = doradoShare + refinerShare
    if (dr > 0) {
      const scale = remainder / dr
      doradoShare *= scale
      refinerShare *= scale
    } else {
      doradoShare = remainder
    }
  }

  return {
    customerShare: clamp01(customerShare),
    doradoShare: clamp01(doradoShare),
    refinerShare: clamp01(refinerShare),
  }
}

function getSharesForItem(
  item: PurchaseOrderItem,
  metal: MetalName,
  orderSpots: SpotPrice[],
  refinerSpots: SpotPrice[],
  category: 'scrap' | 'bullion' | 'total'
) {
  const orderSpot = getSpot(orderSpots, metal)
  const refSpot = getSpot(refinerSpots, metal)

  const doradoPremium =
    item.premium != null
      ? Number(item.premium)
      : orderSpot?.scrap_percentage != null
      ? Number(orderSpot.scrap_percentage)
      : undefined

  const refinerPremium =
    item.refiner_premium != null
      ? Number(item.refiner_premium)
      : refSpot?.scrap_percentage != null
      ? Number(refSpot.scrap_percentage)
      : undefined

  const shares = premiumsToShares(category, doradoPremium, refinerPremium)
  return { ...shares, orderSpot, refSpot }
}

function computeCategoryForAllParties(
  order: PurchaseOrder,
  category: 'scrap' | 'bullion' | 'total',
  orderSpots: SpotPrice[],
  refinerSpots: SpotPrice[]
) {
  const make = () => emptyMetalsDict()
  const customer = make()
  const refiner = make()
  const dorado = make()

  for (const item of order.order_items) {
    const metal = getItemMetal(item)
    if (!metal) continue

    const isScrap = item.item_type === 'scrap'
    const isBullion = item.item_type === 'product'
    if ((category === 'scrap' && !isScrap) || (category === 'bullion' && !isBullion)) continue

    const baseContent = getItemContent(item)
    if (!baseContent) continue

    const { customerShare, doradoShare, refinerShare, orderSpot, refSpot } = getSharesForItem(
      item,
      metal,
      orderSpots,
      refinerSpots,
      category
    )

    const actualScrap = isScrap ? getScrapActualContent(item) : null
    const dorRefContentBasis = isScrap ? (actualScrap ?? baseContent) : baseContent

    const custContent = baseContent * customerShare
    const dorContent = dorRefContentBasis * doradoShare
    const refContent = dorRefContentBasis * refinerShare

    const key = toKey(metal)
    const orderBid = orderSpot?.bid_spot ?? 0
    const refBid = refSpot?.bid_spot ?? 0

    customer[key].content += custContent
    customer[key].profit += custContent * orderBid

    dorado[key].content += dorContent
    dorado[key].profit += dorContent * refBid + (refBid - orderBid)

    refiner[key].content += refContent
    refiner[key].profit += refContent * refBid
  }

  for (const metal of METALS) {
    const key = toKey(metal)
    const denom =
      customer[key].content + dorado[key].content + refiner[key].content

    const pct = (owned: number) => (denom ? (owned / denom) * 100 : 0)

    customer[key].percentage = pct(customer[key].content)
    dorado[key].percentage = pct(dorado[key].content)
    refiner[key].percentage = pct(refiner[key].content)
  }

  const totalContent =
    (customer.gold.content + dorado.gold.content + refiner.gold.content) +
    (customer.silver.content + dorado.silver.content + refiner.silver.content) +
    (customer.platinum.content + dorado.platinum.content + refiner.platinum.content) +
    (customer.palladium.content + dorado.palladium.content + refiner.palladium.content)

  return { customer, refiner, dorado, totalContent }
}

export function computePurchaseOrderTotals(
  order: PurchaseOrder,
  orderSpots: SpotPrice[],
  refinerSpots: SpotPrice[]
): PurchaseOrderTotals {
  const scrap = computeCategoryForAllParties(order, 'scrap', orderSpots, refinerSpots)
  const bullion = computeCategoryForAllParties(order, 'bullion', orderSpots, refinerSpots)
  const total = computeCategoryForAllParties(order, 'total', orderSpots, refinerSpots)

  return {
    total_content: total.totalContent,
    refiner: { scrap: scrap.refiner, bullion: bullion.refiner, total: total.refiner },
    dorado: { scrap: scrap.dorado, bullion: bullion.dorado, total: total.dorado },
    customer: { scrap: scrap.customer, bullion: bullion.customer, total: total.customer },
  }
}
