import { z } from 'zod/v4'
import { UserSummary } from '../auth/users.js'
import { Pdf } from '../media/pdfs.js'
import { EmailKind, EmailStatus } from '../media/enums.js'
import { SpotLockEvent } from '../orders/spot_locks.js'
import { Rail, TransferKind, TransferState } from '../payments/enums.js'

export const OrderState = z.enum([
  'Cancelled',
  'Draft',
  'Awaiting Receipt',
  'At Refiner',
  'Awaiting Finalize',
  'Ready to Pay',
  'Awaiting Payment',
  'Preparing',
  'In Transit',
  'Awaiting Delivery',
  'Pending Assay',
  'Settled',
  'Disputed',
  'Completed',
])
export type OrderState = z.infer<typeof OrderState>

export const SearchKind = z.enum(['order', 'refining_order', 'customer', 'lead', 'lot'])
export type SearchKind = z.infer<typeof SearchKind>

export const SearchHit = z.object({
  kind: SearchKind,
  id: z.string().uuid(),
  reference: z.string(),
  title: z.string(),
})
export type SearchHit = z.infer<typeof SearchHit>

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
  .extend({
    pdf_id: Pdf.shape.id.nullable(),
    size_bytes: Pdf.shape.size_bytes,
    created_at: Pdf.shape.created_at.nullable(),
    created_by_id: Pdf.shape.created_by_id,
  })
export type OrderDocument = z.infer<typeof OrderDocument>

export const StoredDocument = Pdf.pick({
  id: true,
  kind: true,
  size_bytes: true,
  created_at: true,
  created_by_id: true,
})
export type StoredDocument = z.infer<typeof StoredDocument>

export const OrderViewUser = UserSummary.extend({ orders_to_date: z.number().int() })
export type OrderViewUser = z.infer<typeof OrderViewUser>

export const OrderActivityKind = z.enum([
  'order_created',
  'order_updated',
  'order_cancelled',
  'spots_locked',
  'spots_unlocked',
  'transfer_created',
  'transfer_sent',
  'transfer_completed',
  'transfer_event',
  'document_stored',
  'email_sent',
  'refiner_sent',
  'refiner_settled',
  'arrived',
])
export type OrderActivityKind = z.infer<typeof OrderActivityKind>

export const OrderActivityDetail = z
  .object({
    metal_id: SpotLockEvent.shape.metal_id,
    transfer_kind: TransferKind,
    rail: Rail,
    state: TransferState,
    override_reason: z.string(),
    event_type: z.string(),
    document_kind: Pdf.shape.kind,
    email_kind: EmailKind,
    email_status: EmailStatus,
  })
  .partial()
export type OrderActivityDetail = z.infer<typeof OrderActivityDetail>

export const OrderActivity = z.object({
  at: z.string(),
  kind: OrderActivityKind,
  actor_id: z.string().uuid().nullable(),
  subject_id: z.string().uuid(),
  detail: OrderActivityDetail.nullable(),
})
export type OrderActivity = z.infer<typeof OrderActivity>

export const OrderActivityPage = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).default(100),
    before: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
export type OrderActivityPage = z.infer<typeof OrderActivityPage>
