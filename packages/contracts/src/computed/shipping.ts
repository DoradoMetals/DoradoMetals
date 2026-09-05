import { z } from 'zod/v4'
import { ShipmentRead } from '../shipping/shipments.js'
import { CarrierServiceRead } from '../shipping/services.js'
import { PackageRead } from '../shipping/packages.js'
import { ShipmentPickup } from '../shipping/pickups.js'
import { TrackingScan } from '../shipping/tracking.js'
import { CarrierHandoff } from './providers.js'

export const TrackingStep = z.object({
  stage: z.string(),
  location: z.string().nullable(),
  scan_time: z.string().nullable(),
  reached: z.boolean(),
})
export type TrackingStep = z.infer<typeof TrackingStep>

export const ShipmentActions = z.object({
  track: z.boolean(),
  cancel_label: z.boolean(),
  edit_charge: z.boolean(),
  edit_tracking: z.boolean(),
  show_instructions: z.boolean(),
})
export type ShipmentActions = z.infer<typeof ShipmentActions>

export const ShipmentViewFacts = z.object({
  shipment: ShipmentRead,
  service: CarrierServiceRead.nullable(),
  carrier_id: z.string().nullable(),
  package: PackageRead.nullable(),
  carrier_pickup: ShipmentPickup.nullable(),
  handoff_at: z.string().nullable(),
  tracking: z.array(TrackingScan),
})
export type ShipmentViewFacts = z.infer<typeof ShipmentViewFacts>

export const ShipmentDecisions = z.object({
  tracking_status: z.string().nullable(),
  timeline: z.array(TrackingStep),
  actions: ShipmentActions,
})
export type ShipmentDecisions = z.infer<typeof ShipmentDecisions>

export const ShipmentView = ShipmentViewFacts.extend(ShipmentDecisions.shape)
export type ShipmentView = z.infer<typeof ShipmentView>

export const ParcelWeight = z.object({ units: z.string(), value: z.number() })
export type ParcelWeight = z.infer<typeof ParcelWeight>

export const ParcelDimensions = z.object({
  length: z.number(),
  width: z.number(),
  height: z.number(),
  units: z.string(),
})
export type ParcelDimensions = z.infer<typeof ParcelDimensions>

export const ParcelSchedule = z.object({ date: z.string(), time: z.string() })
export type ParcelSchedule = z.infer<typeof ParcelSchedule>

export const Parcel = z.object({
  carrier_id: z.string(),
  serviceType: z.string(),
  carrierCode: z.string(),
  handoff: CarrierHandoff,
  declaredValue: z.number(),
  weight: ParcelWeight,
  dimensions: ParcelDimensions,
  schedule: ParcelSchedule.nullable(),
})
export type Parcel = z.infer<typeof Parcel>
