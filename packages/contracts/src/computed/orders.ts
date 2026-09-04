import { z } from "zod/v4";

// computed: no table backs this. WHAT MAY BE DONE TO AN ORDER is a DECISION,
// read from the order's direction, its lines' confirmed flags, its parcels'
// tracking numbers, its address snapshot and its payout's method - and every
// one of those rules lived in a `switch (order.status)` inside an admin drawer
// until the orders pass. api/domain/orders/rules.ts owns them now and
// `OrderView.actions` carries the answers, so a screen RENDERS them.
//
// It is not a table and never will be: the booleans are derived from five
// tables at once and stored in none.
//
// The members, in order:
//   cancel            POST /orders/:id/cancel - the metal goes back
//   finalize_pricing  POST /orders/:id/finalize_pricing
//   add_funds         POST /orders/:id/add_funds - credit the customer
//   send_to_refiner   POST /orders/:id/send_to_refiner
//   buy_label         POST /orders/:id/label - retry an unbought label
//   update_tracking   PATCH /shipments/:id with a hand-given number
//   edit_lines        POST /orders/:id/items, PATCH /orders/items/:id
//   statuses          the status LABELS this order may be moved to, ALREADY
//                     GATED: a purchase reaches "Payment Processing" only once
//                     every line is confirmed, a sale reaches "In Transit"
//                     only once the refiner has it and it is tracked. Statuses
//                     drive no logic (ruling 2, D211) - this says which are
//                     offered, never what any of them does.
export const OrderActions = z.object({
  cancel: z.boolean(),
  finalize_pricing: z.boolean(),
  add_funds: z.boolean(),
  send_to_refiner: z.boolean(),
  buy_label: z.boolean(),
  update_tracking: z.boolean(),
  edit_lines: z.boolean(),
  statuses: z.array(z.string()),
});
export type OrderActions = z.infer<typeof OrderActions>;
