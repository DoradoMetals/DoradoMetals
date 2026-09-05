import { z } from 'zod/v4'

export const CarrierHandoff = z.object({
  code: z.string(),
  name: z.string(),
  requires_schedule: z.boolean(),
  has_dropoff_locations: z.boolean(),
  display_order: z.number(),
})
export type CarrierHandoff = z.infer<typeof CarrierHandoff>

export const CarrierServiceOption = z.object({
  id: z.string().uuid().nullable(),
  code: z.string(),
  name: z.string(),
  carrier_code: z.string(),
  display_order: z.number(),
  max_insured_value: z.number(),
})
export type CarrierServiceOption = z.infer<typeof CarrierServiceOption>

export const CarrierRateQuote = z.object({
  serviceType: z.string().nullable(),
  packagingType: z.string().nullable(),
  netCharge: z.number().nullable(),
  currency: z.string(),
  deliveryDay: z.string().nullable(),
  transitTime: z.string().nullable(),
  serviceDescription: z.string().nullable(),
})
export type CarrierRateQuote = z.infer<typeof CarrierRateQuote>

export const CheckoutRate = CarrierRateQuote.extend({
  carrier_service_id: z.string().uuid().nullable(),
  name: z.string(),
  carrier_code: z.string(),
  display_order: z.number(),
  max_insured_value: z.number(),
  selected: z.boolean(),
})
export type CheckoutRate = z.infer<typeof CheckoutRate>

export const CarrierPickupWindow = z.object({
  pickupDate: z.string(),
  times: z.array(z.string()),
})
export type CarrierPickupWindow = z.infer<typeof CarrierPickupWindow>

export const CarrierLocation = z.object({
  locationId: z.string(),
  locationType: z.string(),
  distance: z.object({
    value: z.number().nullable(),
    units: z.string(),
  }),
  address: z.object({
    streetLines: z.array(z.string()),
    city: z.string(),
    stateOrProvinceCode: z.string(),
    postalCode: z.string(),
    countryCode: z.string(),
  }),
  contact: z.object({
    companyName: z.string(),
    phoneNumber: z.string(),
  }),
  operatingHours: z.record(z.string(), z.string()).optional(),
  geoPositionalCoordinates: z.object({ latitude: z.number(), longitude: z.number() }).nullable(),
})
export type CarrierLocation = z.infer<typeof CarrierLocation>

export const CarrierLocations = z.object({
  matchedAddressGeoCoord: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
  locations: z.array(CarrierLocation),
})
export type CarrierLocations = z.infer<typeof CarrierLocations>

export const LabelService = CarrierServiceOption.extend({
  carrier_id: z.string().uuid(),
})
export type LabelService = z.infer<typeof LabelService>

export const CarrierPickupBooking = z.object({
  confirmationNumber: z.string().nullable(),
  location: z.string().nullable(),
})
export type CarrierPickupBooking = z.infer<typeof CarrierPickupBooking>

export const CarrierLabel = z.object({
  labelFile: z.string().nullable(),
  tracking_number: z.string().nullable(),
})
export type CarrierLabel = z.infer<typeof CarrierLabel>

export const ShippableCarrier = z.object({ name: z.string() })
export type ShippableCarrier = z.infer<typeof ShippableCarrier>
