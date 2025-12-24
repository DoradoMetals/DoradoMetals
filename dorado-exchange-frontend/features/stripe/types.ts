export interface PaymentIntent {
  id: string
  session_id: string
  user_id: string
  type: string
  payment_intent_id: string
  created_at: Date
  updated_at: Date
  payment_status: string
  sales_order_id: string
  purchase_order_id: string
  method_id: string
  method_type: string
  routing: string
  last_four: string
  card_brand: string
  bank_name: string
  bank_account_type: string
  amount: number
  amount_received: number
  amount_capturable: number
}
