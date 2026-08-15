import { z } from "zod/v4";
import { PayoutsRow } from "../generated/tables.js";

// How a payout appears on an order. Routing and account numbers are absent by
// design: carrying them here meant the admin orders list shipped every
// customer's bank details to the browser. Only the last four travel.
export const PayoutOnOrder = PayoutsRow.omit({
  routing_number: true,
  account_number: true,
}).extend({
  account_last4: z.string().nullable(),
  routing_last4: z.string().nullable(),
});
export type PayoutOnOrder = z.infer<typeof PayoutOnOrder>;

// POST /purchase_orders/get_payout_details, admin only. The full values, read
// one order at a time by someone about to execute a transfer.
export const PayoutDetails = PayoutsRow.omit({
  user_id: true,
  created_at: true,
  cost: true,
});
export type PayoutDetails = z.infer<typeof PayoutDetails>;
