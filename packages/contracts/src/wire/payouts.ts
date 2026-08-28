import { z } from "zod/v4";
import { PayoutsRow } from "../generated/exchange.js";

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

// GET /payouts/:id/details, admin only - the ONE read allowed to carry the
// full bank numbers, fetched one payout at a time by someone about to execute
// a transfer. The VERBATIM exchange.payouts row (ruling 12): the security
// carve-out applies to every OTHER read, not to the details endpoint that
// exists to serve them.
export const PayoutDetails = PayoutsRow;
export type PayoutDetails = z.infer<typeof PayoutDetails>;
