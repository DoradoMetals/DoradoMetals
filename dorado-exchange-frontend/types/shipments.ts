export interface Shipment {
  id: string,
  order_id: string,
  tracking_number: string,
  carrier: string,
  shipping_status: string,
  estimated_delivery: string,
  shipped_at: string,
  delivered_at: string,
  created_at: string,
  shipping_label: string | null,
  label_type: string,
  pickup_type: string,
  package: string,
}

export interface CarrierPickup {
  id: string,
  user_id: string,
  order_id: string,
  carrier: string,
  pickup_requested_at: string,
  pickup_status: string,
  confirmation_number: number,
}