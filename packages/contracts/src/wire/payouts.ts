import { z } from "zod/v4";
import { PayoutsRow } from "../generated/exchange.js";

// GET /orders/:orderId/payouts - the payouts of one order.
//
// RULING 12'S ONE DEVIATION CLASS IS SECURITY, and this is it: routing and
// account numbers are absent by design, and only the last four travel.
// exchange.payouts holds them in plaintext, fourteen of them in production,
// and carrying them here would mean the admin orders list shipping every
// customer's bank details to the browser. `right(..., 4)` happens in the
// statement, so the full value never leaves Postgres on this path.
//
// It was PayoutOnOrder until wave 3, when the order wire slimmed and the
// all-null `payout` slot died with it: a payout is its own read now, and an
// order with none answers [] rather than an object of nulls.
export const Payout = PayoutsRow.omit({
  routing_number: true,
  account_number: true,
}).extend({
  account_last4: z.string().nullable(),
  routing_last4: z.string().nullable(),
});
export type Payout = z.infer<typeof Payout>;

// GET /payouts/:id/details, admin only - the ONE read allowed to carry the
// full bank numbers, fetched one payout at a time by someone about to execute
// a transfer. The VERBATIM exchange.payouts row (ruling 12): the security
// carve-out applies to every OTHER read, not to the details endpoint that
// exists to serve them.
export const PayoutDetails = PayoutsRow;
export type PayoutDetails = z.infer<typeof PayoutDetails>;
