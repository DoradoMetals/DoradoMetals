import { z } from "zod/v4";
import { Fulfillment } from "../fulfillments/fulfillments.js";
import { FulfillmentMethodRead } from "../fulfillments/methods.js";
import { FulfillmentPickup } from "../fulfillments/pickups.js";
import { FulfillmentDirect } from "../fulfillments/directs.js";
import { FulfillmentShipment } from "../fulfillments/shipments.js";
import { FulfillmentCategory } from "../fulfillments/enums.js";

// computed: no table backs either of these. HOW AN ORDER IS HANDED OVER spans
// four tables - the fulfillment, its method, and whichever of pickups /
// directs / shipments its method's CATEGORY points at - and what may be done
// to it is a decision read from all four at once.
//
// Both used to be the browser's. A drawer read the bare row, looked the method
// up in a cached list, branched on `category` to decide which child read to
// make, and decided for itself whether a "Cancel booking" button was earned.
// api/domain/fulfillments/rules.ts owns those answers now.

// WHAT MAY BE DONE TO A FULFILLMENT.
//
//   set_method       POST /fulfillments/set_method - refused once a parcel is
//                    linked and the target is not SHIPMENT, because a bought
//                    label is money the move would strand
//   schedule         POST /fulfillments/schedule_pickup or /schedule_direct,
//                    whichever the category names - false for SHIPMENT, which
//                    is not an appointment
//   cancel_schedule  POST /fulfillments/cancel_schedule - only when a booking
//                    actually exists to cancel
//   categories       the categories this fulfillment may be MOVED to, already
//                    gated the way set_method itself refuses
export const FulfillmentActions = z.object({
  set_method: z.boolean(),
  schedule: z.boolean(),
  cancel_schedule: z.boolean(),
  categories: z.array(FulfillmentCategory),
});
export type FulfillmentActions = z.infer<typeof FulfillmentActions>;

// THE FULFILLMENT VIEW - one fulfillment, assembled from its tables.
//
// ROWS, NOT PROJECTIONS: `method` is the reference row itself, `pickup` and
// `direct` the child rows verbatim, `shipments` the link rows. ABSENT IS null,
// never an object whose every key is null.
//
// The three scalars are the decisions, not shape: `requires_schedule` is the
// category's own answer (a PICKUP or a DIRECT is an appointment, a SHIPMENT is
// not), `is_scheduled` says whether the appointment has been booked, and
// `scheduled_at` is when - read off whichever child exists, so a caller never
// branches on category to find a time.
export const FulfillmentView = z.object({
  fulfillment: Fulfillment,
  method: FulfillmentMethodRead,
  pickup: FulfillmentPickup.nullable(),
  direct: FulfillmentDirect.nullable(),
  shipments: z.array(FulfillmentShipment),
  requires_schedule: z.boolean(),
  is_scheduled: z.boolean(),
  scheduled_at: z.string().nullable(),
  actions: FulfillmentActions,
});
export type FulfillmentView = z.infer<typeof FulfillmentView>;
