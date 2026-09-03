import { z } from "zod/v4";
import { PayoutsRow } from "../generated/exchange.js";

// GET /orders/:orderId/payouts - the payouts of one order.
//
// RULING 12'S ONE DEVIATION CLASS IS SECURITY, and this is it: routing and
// account numbers are absent by design, and only the last four travel. Carrying
// them here would mean the admin orders list shipping every customer's bank
// details to the browser. The full values are not columns of the statement
// behind this shape at all, so nothing on this path can leak one.
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
// a transfer.
//
// IT IS THE PAYOUT ROW PLUS TWO FIELDS, not a second shape. It used to be the
// verbatim exchange.payouts row, because that is where the numbers were read
// from in the clear; they come out of payments.details' AES-256-GCM envelopes
// now, and the rest of the answer is the same projection every other payout
// read serves - so the details response is the list response with the two
// sealed values opened onto it.
export const PayoutDetails = Payout.extend({
  routing_number: z.string().nullable(),
  account_number: z.string().nullable(),
});
export type PayoutDetails = z.infer<typeof PayoutDetails>;
