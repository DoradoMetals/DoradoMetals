import { z } from 'zod/v4'
import { Fulfillment } from '../fulfillments/fulfillments.js'
import { FulfillmentMethodRead } from '../fulfillments/methods.js'
import { FulfillmentPickup } from '../fulfillments/pickups.js'
import { FulfillmentDirect } from '../fulfillments/directs.js'
import { FulfillmentDropoff } from '../fulfillments/dropoffs.js'
import { FulfillmentShipment } from '../fulfillments/shipments.js'
import { FulfillmentCategory, FulfillmentStatus } from '../fulfillments/enums.js'
import { FulfillmentStep } from '../fulfillments/fulfillments.js'
import { FulfillmentMethod } from '../fulfillments/methods.js'
import { Checkout } from '../checkout/checkouts.js'
import { Order } from '../orders/orders.js'
import { RefiningOrder } from '../refining/orders.js'
import { OrderViewShipment } from '../shipping/shipments.js'

export const FulfillmentActions = z
  .object({
    set_method: z.boolean(),
    schedule: z.boolean(),
    cancel_schedule: z.boolean(),
    categories: z.array(FulfillmentCategory),
  })
  .extend({ transitions: z.array(FulfillmentStatus) })
export type FulfillmentActions = z.infer<typeof FulfillmentActions>

export const FulfillmentParcel = OrderViewShipment.pick({
  id: true,
  direction: true,
  shipper_address_id: true,
  recipient_address_id: true,
  package_id: true,
  carrier_service_id: true,
  pickup_date: true,
  pickup_time: true,
  tracking_number: true,
})
export type FulfillmentParcel = z.infer<typeof FulfillmentParcel>

export const LinkedOrder = Order.pick({ id: true, number: true, direction: true }).extend({
  reference: z.string(),
})
export type LinkedOrder = z.infer<typeof LinkedOrder>

export const FulfillmentViewFacts = z.object({
  fulfillment: Fulfillment,
  method: FulfillmentMethodRead,
  pickup: FulfillmentPickup.omit({ user_id: true }).nullable(),
  direct: FulfillmentDirect.nullable(),
  dropoff: FulfillmentDropoff.nullable(),
  shipments: z.array(FulfillmentShipment),
  parcel: FulfillmentParcel.nullable(),
  scheduled_at: z.string().nullable(),
  linked_order: LinkedOrder.nullable(),
})
export type FulfillmentViewFacts = z.infer<typeof FulfillmentViewFacts>

export const FulfillmentDecisions = z.object({
  missing: z.array(FulfillmentStep),
  actions: FulfillmentActions,
})
export type FulfillmentDecisions = z.infer<typeof FulfillmentDecisions>

export const FulfillmentView = FulfillmentViewFacts.extend(FulfillmentDecisions.shape)
export type FulfillmentView = z.infer<typeof FulfillmentView>

export const FulfillmentCreateBody = z
  .object({
    checkout_id: Checkout.shape.id,
    order_id: Order.shape.id,
    refining_order_id: RefiningOrder.shape.id,
  })
  .partial()
  .extend({
    method_id: FulfillmentMethod.shape.id.optional(),
    handoff_code: z.string().optional(),
  })
  .strict()
export type FulfillmentCreateBody = z.infer<typeof FulfillmentCreateBody>
