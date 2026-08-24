import { z } from "zod/v4";
import { MethodsRow } from "../generated/fulfillments.js";

// Fulfillments are the one feature with no legacy wire shape, because nothing
// consumes them yet. exchange never recorded how an order was handed over
// beyond shipments.pickup_type, so there is no older response to stay
// compatible with and no *_WIRE switch: these schemas describe the only shape
// the endpoints have ever had.

// The customer-facing menu and the admin list are the same row, minus the audit
// columns nobody outside the API needs.
export const FulfillmentMethodWire = MethodsRow.pick({
  id: true,
  type: true,
  label: true,
  admin_label: true,
  category: true,
  direction: true,
  enabled: true,
  hidden: true,
  is_default: true,
  created_at: true,
  updated_at: true,
});
export type FulfillmentMethodWire = z.infer<typeof FulfillmentMethodWire>;

// The detail objects are built with jsonb_build_object rather than selected as
// columns, so their timestamps arrive as STRINGS carrying an offset, not as the
// Date objects the driver would hand back for a plain timestamptz. That is a
// real difference in the response and the contract says so rather than papering
// over it with a coerce.
const Booking = {
  id: z.string().uuid(),
  assigned_employee_id: z.string().uuid().nullable(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
};

export const FulfillmentPickupWire = z.object({
  ...Booking,
  pickup_address_id: z.string().uuid(),
});
export type FulfillmentPickupWire = z.infer<typeof FulfillmentPickupWire>;

export const FulfillmentDirectWire = z.object({
  ...Booking,
  location_id: z.string().uuid(),
  is_appointment: z.boolean(),
});
export type FulfillmentDirectWire = z.infer<typeof FulfillmentDirectWire>;

export const FulfillmentShipmentWire = z.object({
  id: z.string().uuid(),
  shipment_id: z.string().uuid(),
  recipient_location_id: z.string().uuid().nullable(),
  shipper_location_id: z.string().uuid().nullable(),
});
export type FulfillmentShipmentWire = z.infer<typeof FulfillmentShipmentWire>;

// The method is nested rather than flattened, because a method exists
// independently of any fulfillment - the same row is referenced by every order
// that chose it. The detail is nested under the name of its category and
// exactly one of the three is ever present: a fulfillment has one method, a
// method has one category, and the category names which table holds the detail.
export const FulfillmentWire = z.object({
  id: z.string().uuid(),
  order_id: z.string().uuid(),
  status: z.string(),
  // Strings, not z.date(): a contract describes the wire, and the wire is what
  // JSON.stringify produced. These two ARE Date objects in the repo's result -
  // they are plain columns, unlike the nested detail - and they are strings by
  // the time anything reads them.
  created_at: z.string(),
  updated_at: z.string(),
  created_by_id: z.string().uuid().nullable(),
  updated_by_id: z.string().uuid().nullable(),
  method: z.object({
    id: z.string().uuid(),
    type: z.string(),
    label: z.string(),
    admin_label: z.string().nullable(),
    category: z.enum(["SHIPMENT", "PICKUP", "DIRECT"]),
    direction: z.enum(["purchase", "sale"]).nullable(),
  }),
  pickup: FulfillmentPickupWire.nullable(),
  direct: FulfillmentDirectWire.nullable(),
  shipment: FulfillmentShipmentWire.nullable(),
});
export type FulfillmentWire = z.infer<typeof FulfillmentWire>;
