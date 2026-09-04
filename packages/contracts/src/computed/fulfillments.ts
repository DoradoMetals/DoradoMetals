import { z } from "zod/v4";
import { Fulfillment } from "../fulfillments/fulfillments.js";
import { FulfillmentMethodRead } from "../fulfillments/methods.js";
import { FulfillmentPickup } from "../fulfillments/pickups.js";
import { FulfillmentDirect } from "../fulfillments/directs.js";
import { FulfillmentShipment } from "../fulfillments/shipments.js";
import { FulfillmentCategory } from "../fulfillments/enums.js";
import { FulfillmentStep } from "../fulfillments/fulfillments.js";
import { FulfillmentMethod } from "../fulfillments/methods.js";
import { Checkout } from "../checkout/checkouts.js";
import { OrderViewShipment } from "../shipping/shipments.js";

export const FulfillmentActions = z.object({
  set_method: z.boolean(),
  schedule: z.boolean(),
  cancel_schedule: z.boolean(),
  categories: z.array(FulfillmentCategory),
});
export type FulfillmentActions = z.infer<typeof FulfillmentActions>;

export const FulfillmentParcel = OrderViewShipment.pick({
  id: true,
  direction: true,
  shipper_address_id: true,
  recipient_address_id: true,
  package_id: true,
  carrier_service_id: true,
  pickup_date: true,
  pickup_time: true,
});
export type FulfillmentParcel = z.infer<typeof FulfillmentParcel>;

export const FulfillmentView = z.object({
  fulfillment: Fulfillment,
  method: FulfillmentMethodRead,
  pickup: FulfillmentPickup.nullable(),
  direct: FulfillmentDirect.nullable(),
  shipments: z.array(FulfillmentShipment),
  parcel: FulfillmentParcel.nullable(),
  requires_schedule: z.boolean(),
  is_scheduled: z.boolean(),
  scheduled_at: z.string().nullable(),
  missing: z.array(FulfillmentStep),
  actions: FulfillmentActions,
});
export type FulfillmentView = z.infer<typeof FulfillmentView>;

export const FulfillmentCreateBody = z.object({
  checkout_id: Checkout.shape.id,
}).extend({
  method_id: FulfillmentMethod.shape.id.optional(),
  handoff_code: z.string().optional(),
}).strict();
export type FulfillmentCreateBody = z.infer<typeof FulfillmentCreateBody>;
