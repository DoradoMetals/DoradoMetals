import {
  ProfitMetalsDict,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderTotals,
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

function computeMetalsForAllParties(
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

    const dorRefContentBasis = isScrap ? actualScrap ?? baseContent : baseContent

    const custContent = baseContent * customerShare
    const refContent = dorRefContentBasis * refinerShare
    let dorContent = dorRefContentBasis - custContent - refContent

    const key = toKey(metal)
    const orderBid = orderSpot?.bid_spot ?? 0
    const refBid = refSpot?.bid_spot ?? 0

    customer[key].content += custContent
    customer[key].profit += custContent * orderBid

    dorado[key].content += dorContent
    dorado[key].profit += dorContent * refBid

    refiner[key].content += refContent
    refiner[key].profit += refContent * refBid
  }

  for (const metal of METALS) {
    const key = toKey(metal)
    const denom = customer[key].content + dorado[key].content + refiner[key].content

    const pct = (owned: number) => (denom ? (owned / denom) * 100 : 0)

    customer[key].percentage = pct(customer[key].content)
    dorado[key].percentage = pct(dorado[key].content)
    refiner[key].percentage = pct(refiner[key].content)
  }

  return { customer, refiner, dorado }
}

function getShippingFees(order: PurchaseOrder) {
  return {
    refiner: 0,
    dorado: order.shipping_fee_actual ?? 0,
    customer: order.shipment.shipping_charge ?? 0,
  }
}

export function getSpotNet(
  customerTotals: ProfitMetalsDict,
  orderSpots: SpotPrice[],
  refinerSpots: SpotPrice[]
) {
  let sum = 0

  for (const metal of METALS) {
    const key = toKey(metal)
    const qty = customerTotals[key]?.content ?? 0
    if (!qty) continue

    const orderBid = getSpot(orderSpots, metal)?.bid_spot
    const refBid = getSpot(refinerSpots, metal)?.bid_spot
    if (orderBid == null || refBid == null) continue

    sum += qty * (refBid - orderBid)
  }

  return {
    refiner: 0,
    dorado: sum,
    customer: 0,
  }
}

export function getTotalProfit(
  totalMetals: ProfitMetalsDict,
  shippingFee: number,
  spotNet: number = 0,
  refiner_fee: number = 0
): number {
  const metalsProfit =
    (totalMetals.gold?.profit ?? 0) +
    (totalMetals.silver?.profit ?? 0) +
    (totalMetals.platinum?.profit ?? 0) +
    (totalMetals.palladium?.profit ?? 0)

  return metalsProfit + spotNet - shippingFee - refiner_fee
}

export function computePurchaseOrderTotals(
  order: PurchaseOrder,
  orderSpots: SpotPrice[],
  refinerSpots: SpotPrice[]
): PurchaseOrderTotals {
  const scrap = computeMetalsForAllParties(order, 'scrap', orderSpots, refinerSpots)
  const bullion = computeMetalsForAllParties(order, 'bullion', orderSpots, refinerSpots)
  const total = computeMetalsForAllParties(order, 'total', orderSpots, refinerSpots)
  const shipping = getShippingFees(order)
  const spotNet = getSpotNet(total.customer, orderSpots, refinerSpots)

  return {
    refiner: {
      scrap: scrap.refiner,
      bullion: bullion.refiner,
      total: total.refiner,
      shipping_net: shipping.refiner,
      refiner_fee_net: 0,
      spot_net: spotNet.refiner,
      total_profit: getTotalProfit(total.refiner, shipping.refiner, spotNet.refiner, 0),
    },
    dorado: {
      scrap: scrap.dorado,
      bullion: bullion.dorado,
      total: total.dorado,
      shipping_net: shipping.customer - shipping.dorado,
      refiner_fee_net: -Math.abs(Number(order.refiner_fee ?? 0)),
      spot_net: spotNet.dorado,
      total_profit: getTotalProfit(
        total.dorado,
        shipping.dorado - shipping.customer,
        spotNet.dorado,
        order.refiner_fee
      ),
    },
    customer: {
      scrap: scrap.customer,
      bullion: bullion.customer,
      total: total.customer,
      shipping_net: shipping.dorado - shipping.customer,
      refiner_fee_net: -Math.abs(Number(order.payout.cost ?? 0)),
      spot_net: spotNet.customer,
      total_profit: getTotalProfit(total.customer, shipping.customer, spotNet.customer, order.payout.cost),
    },
  }
}
