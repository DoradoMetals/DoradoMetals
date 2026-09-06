import { z } from 'zod/v4'

export const OrderActions = z.object({
  cancel: z.boolean(),
  reopen: z.boolean(),
  finalize: z.boolean(),
  add_funds: z.boolean(),
  supply: z.boolean(),
  buy_label: z.boolean(),
  update_tracking: z.boolean(),
  edit_lots: z.boolean(),
  assign_lots: z.boolean(),
  statuses: z.array(z.string()),
  // What Finalize is waiting on, in the operator's words. Empty means the gate
  // is open, and `finalize` is the same answer as a boolean.
  finalize_blocked_by: z.array(z.string()),
})
export type OrderActions = z.infer<typeof OrderActions>

export const SettledAwaiting = z.object({
  order_id: z.string().uuid(),
  payment_intent_id: z.string(),
})
export type SettledAwaiting = z.infer<typeof SettledAwaiting>

export const AbandonedSale = z.object({
  order_id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  used_funds: z.boolean().nullable(),
  reserved_funds: z.number().nullable(),
  payment_intent_id: z.string().nullable(),
  payment_status: z.string().nullable(),
})
export type AbandonedSale = z.infer<typeof AbandonedSale>

// A document the order can produce. `available` says whether it can be
// generated now - an Invoice is unavailable until the order is finalized - and
// the Documents card offers Send on an available row and Import on the rest.
export const OrderDocument = z.object({
  kind: z.string(),
  name: z.string(),
  available: z.boolean(),
})
export type OrderDocument = z.infer<typeof OrderDocument>
