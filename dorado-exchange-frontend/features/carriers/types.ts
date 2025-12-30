export interface Carrier {
  id: string
  name: string
  email: string
  phone: string
  created_at: Date
  updated_at: Date
  logo: string
  is_active: boolean
}
export type DeliverySpeed = 'same_day' | 'overnight' | '2_day' | 'ground' | 'economy' | string

export interface CarrierService {
  id: string
  carrier_id: string
  name: string
  description: string | null
  code: string
  provider_code: string | null
  min_transit_days: number
  max_transit_days: number
  supports_pickup: boolean
  supports_dropoff: boolean
  supports_returns: boolean
  max_weight_lbs: number | null
  max_length_in: number | null
  max_width_in: number | null
  max_height_in: number | null
  supports_insurance: boolean
  max_declared_value: number | null
  is_international: boolean
  is_residential: boolean
  is_active: boolean
  display_order: number
  created_by: string
  updated_by: string
  created_at: Date
  updated_at: Date
}

export interface NewCarrierService {
  carrier_id: string
  name: string
}
