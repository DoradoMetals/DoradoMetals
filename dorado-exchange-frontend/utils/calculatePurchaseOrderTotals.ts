// import { SpotPrice } from '@/types/metal'
// import { Product } from '@/types/product'
// import { PurchaseOrder, PurchaseOrderTotals } from '@/types/purchase-order'

// const calculateTotalContent = (order: PurchaseOrder) => {
//   const totalContent = order.order_items.reduce((acc, item) => {
//     if (item.item_type === 'product') {
//       const content = (item?.product?.content ?? 0) * (item?.product?.quantity ?? 1)
//       return acc + content
//     }

//     if (item.item_type === 'scrap') {
//       const content = item?.scrap?.content ?? 0
//       return acc + content
//     }

//     return acc
//   }, 0)
//   return totalContent
// }

// const calculateDetails = (total_content: number, return_percentage: number, spots: SpotPrice[]) => {
//   return {
//     content: total_content * return_percentage,
//     percentage: return_percentage,

//   }
// }

// export function calculateSalesOrderPrices({
//   order,
//   orderSpots,
//   refinerSpots,
// }: {
//   order: PurchaseOrder
//   orderSpots: SpotPrice[]
//   refinerSpots: SpotPrice
// }): PurchaseOrderTotals {
//   const total_content = calculateTotalContent(order)

//   return {
//     total_content: total_content,
//     refiner: refiner,
//     dorado: dorado,
//     customer: customer,
//   }
// }
