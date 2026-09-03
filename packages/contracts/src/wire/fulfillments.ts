import { z } from "zod/v4";
import {
  DirectsRow,
  FulfillmentsRow,
  MethodsRow,
  PickupsRow,
} from "../generated/fulfillments.js";

// Fulfillments are the one feature with no legacy wire shape, because nothing
// consumes them yet. exchange never recorded how an order was handed over
// beyond shipments.pickup_type, so there is no older response to stay
// compatible with and no *_WIRE switch: these schemas describe the only shape
// the endpoints have ever had.

// The customer-facing menu and the admin list are the same row, minus the audit
// columns nobody outside the API needs.
export const FulfillmentMethod = MethodsRow.pick({
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
export type FulfillmentMethod = z.infer<typeof FulfillmentMethod>;

// GET /orders/:orderId/fulfillments - THE BARE fulfillments.fulfillments
// row, verbatim, and nothing else (rulings 9 + 12, final form). No method
// embed - methods are reference data the client maps by method_id off
// GET /fulfillments/methods - and no resolved children: the shipment,
// pickup and direct reads are wave 3's own parent-path endpoints
// (/orders/:orderId/shipments etc.), landed when the drawers consume them.
export const OrderFulfillment = FulfillmentsRow;
export type OrderFulfillment = z.infer<typeof OrderFulfillment>;

// The same row under the name the get_for_order and schedule endpoints have
// always used. The composed shape - a nested method object plus pickup /
// direct / shipment members - died with the wave-2 final form above; what the
// service composes internally (its own logic branches on method.category)
// never reaches the wire.
export const Fulfillment = FulfillmentsRow;
export type Fulfillment = z.infer<typeof Fulfillment>;

// GET /orders/:orderId/pickups and /orders/:orderId/directs - the
// fulfillment's own children, VERBATIM rows, resolved from the order id in
// the server's WHERE clause.
//
// US COLLECTING FROM A CUSTOMER (a pickup) and A CUSTOMER COMING TO US (a
// direct) are the two non-shipment ways an order is handed over. A
// FulfillmentPickup is not a ShipmentPickup: that one is FedEx coming for a
// parcel, hangs off the shipment, and lives in the shipping schema. The two
// tables share a word and nothing else.
export const FulfillmentPickup = PickupsRow;
export type FulfillmentPickup = z.infer<typeof FulfillmentPickup>;

export const FulfillmentDirect = DirectsRow;
export type FulfillmentDirect = z.infer<typeof FulfillmentDirect>;

// ============================================================================
// WRITE BODIES
// ============================================================================

// POST /fulfillments/methods/update - db/fulfillments/methods/repo.ts's own
// PATCHABLE. type/category/direction are not writable: changing a method's
// category would move existing fulfillments to a detail table their rows
// aren't in. `admin_label` is re-typed non-nullable: the row allows null, but
// update.sql's COALESCE cannot tell an explicit null apart from an absent
// field (both leave the column untouched), so there is no real clear to
// offer here.
export const FulfillmentMethodPatch = MethodsRow.pick({
  label: true,
  admin_label: true,
  enabled: true,
  hidden: true,
}).extend({
  admin_label: z.string(),
}).partial();
export type FulfillmentMethodPatch = z.infer<typeof FulfillmentMethodPatch>;

// POST /fulfillments/set_method - both ids (ruling 43); nothing else.
export const FulfillmentSetMethodBody = z.object({
  fulfillment_id: FulfillmentsRow.shape.id,
  method_id: MethodsRow.shape.id,
}).strict();
export type FulfillmentSetMethodBody = z.infer<typeof FulfillmentSetMethodBody>;

// POST /fulfillments/set_status - the id and the new label. `status` stays
// `z.string()`: fulfillments.fulfillments.status is plain text with no
// constraint (same reasoning as leads.priority).
export const FulfillmentSetStatusBody = z.object({
  fulfillment_id: FulfillmentsRow.shape.id,
  status: FulfillmentsRow.shape.status,
}).strict();
export type FulfillmentSetStatusBody = z.infer<typeof FulfillmentSetStatusBody>;

// POST /fulfillments/cancel_schedule - the id alone.
export const FulfillmentCancelScheduleBody = z.object({
  fulfillment_id: FulfillmentsRow.shape.id,
}).strict();
export type FulfillmentCancelScheduleBody = z.infer<typeof FulfillmentCancelScheduleBody>;

// POST /fulfillments/schedule_pickup - fulfillments.pickups is upsert-only
// (one row per fulfillment), so this is the row minus its own generated id.
export const ScheduleFulfillmentPickupBody = PickupsRow.omit({ id: true }).partial({
  assigned_employee_id: true,
  start_time: true,
  end_time: true,
});
export type ScheduleFulfillmentPickupBody = z.infer<typeof ScheduleFulfillmentPickupBody>;

// POST /fulfillments/schedule_direct - same shape, fulfillments.directs.
export const ScheduleFulfillmentDirectBody = DirectsRow.omit({ id: true }).partial({
  assigned_employee_id: true,
  is_appointment: true,
  start_time: true,
  end_time: true,
});
export type ScheduleFulfillmentDirectBody = z.infer<typeof ScheduleFulfillmentDirectBody>;
