import { z } from "zod/v4";
import { FulfillmentsRow, MethodsRow } from "../generated/fulfillments.js";

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
