import { z } from "zod/v4";
import { Direction } from "./direction.js";
import { CheckoutsRow, ItemsRow } from "../generated/checkout.js";

// The request bodies of the checkout surface, parsed strictly at the transport.

// One basket line. The value columns are optional as well as nullable: a coin
// is a bullion_id and a quantity. `content` and `premium` are the server's.
export const NewCheckoutItem = ItemsRow.pick({
  bullion_id: true,
  metal_id: true,
  pre_melt: true,
  post_melt: true,
  purity: true,
  unit: true,
})
  .partial()
  .extend({ quantity: z.number() })
  .strict();
export type NewCheckoutItem = z.infer<typeof NewCheckoutItem>;

// The whole basket; the sync replaces rather than merges.
export const CheckoutItemsBody = z.object({
  items: z.array(NewCheckoutItem),
}).strict();
export type CheckoutItemsBody = z.infer<typeof CheckoutItemsBody>;

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
