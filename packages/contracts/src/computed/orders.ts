import { z } from 'zod/v4'
import { UserSummary } from '../auth/users.js'
import { Pdf } from '../media/pdfs.js'

export const OrderState = z.enum([
  'Cancelled',
  'Awaiting Receipt',
  'At Refiner',
  'Awaiting Payout',
  'Ready to Pay',
  'Awaiting Payment',
  'Preparing',
  'In Transit',
  'Completed',
])
export type OrderState = z.infer<typeof OrderState>

export const Action = z.object({
  name: z.string(),
  confirm: z.string().nullable(),
  override: z.string().nullable(),
})
export type Action = z.infer<typeof Action>

export const OverrideBody = z.object({ override_reason: z.string().nullable() }).partial().strict()
export type OverrideBody = z.infer<typeof OverrideBody>

export const OrderActions = z.array(Action)
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
