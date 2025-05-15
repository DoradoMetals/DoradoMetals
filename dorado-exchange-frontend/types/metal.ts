export type SpotPrice = {
  id: string
  purchase_order_id?: string
  sales_order_id?: string
  type: string
  ask_spot: number
  bid_spot: number
  percent_change: number
  dollar_change: number
  scrap_percentage: number
  created_at?: Date
  updated_at?: Date
}