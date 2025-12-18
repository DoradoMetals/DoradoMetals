export interface TotalProfits {
  profits: Profits[]
}

export interface Profits {
  id: string
  purchase_order_id: string
  sales_order_id: string
  total: number
  net: Net
}

export interface Net {
  id: string
  profit_id: string
  spot: number
  gold_spot: number
  silver_spot: number
  platinum_spot: number
  palladium_spot: number
  gold_scrap: number
  silver_scrap: number
  silver_bullion: number
  platinum_scrap: number
  platinum_bullion: number
  transaction_fees: number
  pool_remediation: number
}