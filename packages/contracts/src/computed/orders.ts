import { z } from 'zod/v4'
import { UserSummary } from '../auth/users.js'
import { Pdf } from '../media/pdfs.js'

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
  lock_spots: z.boolean(),
  unlock_spots: z.boolean(),
  statuses: z.array(z.string()),
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

export const OrderDocument = z
  .object({
    kind: Pdf.shape.kind,
    name: z.string(),
    available: z.boolean(),
  })
  .extend({ pdf_id: Pdf.shape.id.nullable() })
export type OrderDocument = z.infer<typeof OrderDocument>

export const StoredDocument = Pdf.pick({ id: true, kind: true })
export type StoredDocument = z.infer<typeof StoredDocument>

export const OrderViewUser = UserSummary.extend({ orders_to_date: z.number().int() })
export type OrderViewUser = z.infer<typeof OrderViewUser>
