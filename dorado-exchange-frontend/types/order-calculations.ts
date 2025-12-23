import { Metal } from '../features/spots/types'

interface LineItems {
  metal: Metal
  type: 'Scrap' | 'Bullion'
  refiner_post_melt: number
  post_melt: number
  refiner_purity: number
  purity: number
  refiner_rate: number
  rate: number
  refiner_quantity: number
  quantity: number
}

interface Actuals {
  refiner_payout: number
  payout: number
  profit: number
}

interface Fees {
  customer_shipping: number
  shipping: number
  customer_transaction: number
  transaction: number
}

interface Spots {
  refiner_gold: number
  refiner_silver: number
  refiner_platinum: number
  refiner_palladium: number
  gold: number
  silver: number
  platinum: number
  palladium: number
}


export interface PurchaseOrderCalculationInputs {
  items: LineItems
  actuals: Actuals
  fees: Fees
  spots: Spots
}


// interface MetalBase {
//   refiner_content: number
//   refiner_payable: number
//   refiner_payable_dollars: number
//   content: number
//   payable: number
//   payable_dollars: number
//   effective_content: number
//   net_spot: number
// }

// interface MetalTypes {
//   scrap: MetalBase
//   bullion: MetalBase
// }

// interface MetalCalcs {
//   gold: MetalTypes
//   silver: MetalTypes
//   platinum: MetalTypes
//   palladium: MetalTypes
// }


// export interface PurchaseOrderCalculationResults {
//   totalProfit: number,

// }
