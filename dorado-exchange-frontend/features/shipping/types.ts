import { Address } from '@/features/addresses/types'

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

export type ScanEventItem = {
  status: string
  location: string
  scan_time: Date
}

export type ShipmentTracking = {
  id: string
  tracking_number: string
  shipping_status: string
  estimated_delivery: Date
  delivered_at: Date
  scan_events: ScanEventItem[]
}

export type ShipmentTrackingInput = {
  shipment_id: string
  tracking_number: string
  carrier_id: string
}

export type ShippingCarrierId = string

export type ShippingPackage = {
  weight: { units: 'LB' | 'KG'; value: number }
  dimensions: { length: number; width: number; height: number; units: 'IN' | 'CM' }
}

export type ShippingRatesInput = {
  carrier_id: ShippingCarrierId
  shippingType: 'Inbound' | 'Outbound' | 'Return'
  address: Address
  pkg: ShippingPackage
  pickupType?: string
  declaredValue?: { amount: number; currency: string }
}

export type ShippingRate = {
  serviceType: string
  packagingType: string
  netCharge: number
  currency: string
  deliveryDay?: string
  transitTime?: Date
  serviceDescription: string
}

export type ShippingPickupTimesInput = {
  carrier_id: ShippingCarrierId
  pickupAddress: Address
  code: string
  readyDate: string
}

export type ShippingPickupTimes = {
  pickupDate: string
  times: string[]
}

export type ShippingLocationsInput = {
  carrier_id: ShippingCarrierId
  address: Address
  radius_miles?: number
  max_results?: number
}

export type ShippingLocation = {
  locationId: string
  locationType: string
  distance: { value: number; units: string }
  address: {
    streetLines: string[]
    city: string
    stateOrProvinceCode: string
    postalCode: string
    countryCode: string
  }
  contact: {
    companyName: string
    phoneNumber: string
  }
  operatingHours?: Record<string, string>
  latestExpressDropOffTime?: string
  geoPositionalCoordinates: { latitude: number; longitude: number }
}

export type ShippingLocationsReturn = {
  matchedAddressGeoCoord: { latitude: number; longitude: number }
  locations: ShippingLocation[]
}

export type ShippingValidateAddressInput = {
  carrier_id: ShippingCarrierId
  address: Address
}

export type ShippingCancelLabelInput = {
  carrier_id: ShippingCarrierId
  shipment_id: string
  tracking_number: string
}

export type ShippingCancelLabelResult = {
  success: boolean
  shipping_status?: string
}

export type ShippingCancelPickupInput = {
  carrier_id: ShippingCarrierId
  pickup_id?: string
  confirmation_code?: number
}

export type ShippingCancelPickupResult = {
  success: boolean
  status?: string
}
