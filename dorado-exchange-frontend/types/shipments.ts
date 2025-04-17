export interface Shipment {
  id: string,
  order_id: string,
  tracking_number: string,
  carrier: string,
  shipping_status: string,
  estimated_delivery: string,
  shipped_at: Date,
  delivered_at: Date,
  created_at: Date,
  shipping_label: string | null,
}