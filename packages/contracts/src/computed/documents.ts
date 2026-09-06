import { z } from 'zod/v4'
import { Order } from '../orders/orders.js'
import { Direction } from '../orders/enums.js'
import { User } from '../auth/users.js'

// One line of a mailer's summary card - the Email Row symbol. Label left,
// figure right. The rows come out of the mailer's own SQL read as jsonb, so a
// template never stitches one (ruling 78).
export const MailerRow = z.object({
  label: z.string(),
  value: z.string(),
})
export type MailerRow = z.infer<typeof MailerRow>

// Who the mailer goes to and what its paper-trail row links to.
export const MailerAddressee = z.object({
  order_id: Order.shape.id.nullable(),
  user_id: User.shape.id.nullable(),
  email: User.shape.email,
  name: User.shape.name,
})
export type MailerAddressee = z.infer<typeof MailerAddressee>

export const OrderReceivedMail = MailerAddressee.extend({
  order_number: Order.shape.number,
  direction: Direction,
  rows: z.array(MailerRow),
})
export type OrderReceivedMail = z.infer<typeof OrderReceivedMail>

export const PayoutSentMail = MailerAddressee.extend({
  order_number: Order.shape.number,
  method: z.string().nullable(),
  account_last4: z.string().nullable(),
  amount: z.string(),
  rows: z.array(MailerRow),
})
export type PayoutSentMail = z.infer<typeof PayoutSentMail>

export const ShipmentMail = MailerAddressee.extend({
  order_number: Order.shape.number,
  direction: Direction,
  tracking_number: z.string().nullable(),
  rows: z.array(MailerRow),
})
export type ShipmentMail = z.infer<typeof ShipmentMail>

export const ScheduleMail = MailerAddressee.extend({
  order_number: Order.shape.number,
  direction: Direction,
  starts_at: z.string().nullable(),
  venue: z.string().nullable(),
  rows: z.array(MailerRow),
})
export type ScheduleMail = z.infer<typeof ScheduleMail>

export const DocumentSentMail = MailerAddressee.extend({
  order_number: Order.shape.number,
  direction: Direction,
  document_label: z.string(),
  rows: z.array(MailerRow),
})
export type DocumentSentMail = z.infer<typeof DocumentSentMail>

export const SignInCodeMail = MailerAddressee.extend({
  code: z.string(),
  expires_in_minutes: z.number().int(),
})
export type SignInCodeMail = z.infer<typeof SignInCodeMail>

export const AccountCreatedMail = MailerAddressee.extend({
  url: z.string(),
})
export type AccountCreatedMail = z.infer<typeof AccountCreatedMail>

export const DetailsChangedMail = MailerAddressee.extend({
  changed: z.string(),
  changed_at: z.string(),
  rows: z.array(MailerRow),
})
export type DetailsChangedMail = z.infer<typeof DetailsChangedMail>

export const PromoMail = MailerAddressee.extend({
  eyebrow: z.string(),
  headline: z.string(),
  lede: z.string(),
  stat_label: z.string(),
  stat_value: z.string(),
  rows: z.array(MailerRow),
  url: z.string(),
})
export type PromoMail = z.infer<typeof PromoMail>
