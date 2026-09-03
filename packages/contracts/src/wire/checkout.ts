import { z } from "zod/v4";
import { Direction } from "./direction.js";
import { CheckoutsRow } from "../generated/checkout.js";

// THE REQUEST BODIES OF THE CHECKOUT SURFACE.
//
// Most of wire/ describes what the API RETURNS; these describe what it
// ACCEPTS, for the same reason wire/patches.ts does - the transport boundary
// parses a body once, in strict mode, before any service runs, and the schema
// it parses against has to live where both sides can see it.
//
// A FIELD DECLARED AND IGNORED IS NOT A MISTAKE. `user_id` on both cart syncs
// is sent by a deployed frontend and is deliberately not read: a cart belongs
// to the SESSION, not to whoever names a user, and the id comes from req.user.
// Declaring it is what keeps an older client from being answered 400 for
// sending something harmless.


// A buy-cart line: an id and how many. Nothing else is read - the price,
// premium and content all come back from the catalogue.
export const CartLineBody = z.object({
  id: z.string(),
  quantity: z.number(),
});
export type CartLineBody = z.infer<typeof CartLineBody>;

export const SyncCartBody = z.object({
  cart: z.array(CartLineBody).default([]),
  user_id: z.string().optional(),
}).strict();
export type SyncCartBody = z.infer<typeof SyncCartBody>;

// A sell-cart line is either a piece of SCRAP carrying its own values or a
// named catalogue PRODUCT, told apart by `type`. `data` stays an open object
// because the frontend sends the whole store item and the server reads a
// named handful off it - pinning the keys would refuse a body that works.
export const SellCartLineBody = z.looseObject({
  type: z.string().optional(),
  quantity: z.number().optional(),
  product_name: z.string().optional(),
  data: z.looseObject({}).optional(),
});
export type SellCartLineBody = z.infer<typeof SellCartLineBody>;

export const SyncSellCartBody = z.object({
  cart: z.array(SellCartLineBody).default([]),
  user_id: z.string().optional(),
}).strict();
export type SyncSellCartBody = z.infer<typeof SyncSellCartBody>;

// The columns a CUSTOMER may write on their own checkout row. Narrower than
// the table on purpose: fulfillment_id and the payout pointers are written by
// the services that also create what they point at, never by a request.
// SPLIT IN TWO ON PURPOSE. `direction` names WHICH session is being written
// and is not a column of the patch, so the columns get their own schema: the
// controller parses the body strictly, then parses the columns out of it. A
// plain object schema strips what it does not declare, which is what removes
// `direction` without a rest element.
export const CheckoutPatchColumns = CheckoutsRow.pick({
  payment_method_id: true,
  recipient_address_id: true,
  shipper_address_id: true,
  pickup_address_id: true,
  carrier_service_id: true,
  package_id: true,
  appointment_location_id: true,
  appointment_time: true,
  package_weight: true,
  declared_value: true,
  pickup_date: true,
  pickup_time: true,
}).partial();
export type CheckoutPatchColumns = z.infer<typeof CheckoutPatchColumns>;

export const CheckoutPatchBody = CheckoutPatchColumns
  .extend({ direction: Direction })
  .strict();
export type CheckoutPatchBody = z.infer<typeof CheckoutPatchBody>;

// The stepper picks a carrier HANDOFF and never spells a fulfillment method;
// the server owns that vocabulary. Either names the step.
export const CheckoutFulfillmentBody = z.object({
  direction: Direction,
  method_id: z.string().optional(),
  handoff_code: z.string().optional(),
}).strict();
export type CheckoutFulfillmentBody = z.infer<typeof CheckoutFulfillmentBody>;

// The payout step's form (D210). THE TWO NUMBERS NEVER COME BACK: they are
// sealed at rest and the response carries only the last four digits.
export const CheckoutPayoutForm = z.object({
  method: z.string(),
  account_holder_name: z.string(),
  bank_name: z.string().nullable().optional(),
  account_type: z.string().nullable().optional(),
  routing_number: z.string().nullable().optional(),
  account_number: z.string().nullable().optional(),
  payout_email: z.string().nullable().optional(),
});
export type CheckoutPayoutForm = z.infer<typeof CheckoutPayoutForm>;

export const CheckoutPayoutBody = CheckoutPayoutForm
  .extend({ direction: Direction })
  .strict();
export type CheckoutPayoutBody = z.infer<typeof CheckoutPayoutBody>;
