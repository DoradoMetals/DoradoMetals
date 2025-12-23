export interface Shipment {
  id: string
  purchase_order_id: string
  sales_order_id: string
  tracking_number: string
  shipping_status: string
  estimated_delivery: string
  shipped_at: string
  delivered_at: string
  created_at: string
  shipping_label: string | null
  label_type: string
  pickup_type: string
  package: string
  shipping_service: string
  shipping_charge: number
  insured: boolean
  declared_value: number
  type: string
  carrier_id: string
}

export interface CarrierPickup {
  id: string
  user_id: string
  order_id: string
  carrier: string
  pickup_requested_at: string
  pickup_status: string
  confirmation_number: number
  location: string
}

export type ScanEventItem = {
  status: string,
  location: string,
  scan_time: Date,
}

export type ShipmentTracking = {
  id: string,
  tracking_number: string,
  shipping_status: string,
  estimated_delivery: Date,
  delivered_at: Date,
  scan_events: ScanEventItem[]
}

export type ShipmentTrackingInput = {
  shipment_id: string
  tracking_number: string
  carrier_id: string
}
