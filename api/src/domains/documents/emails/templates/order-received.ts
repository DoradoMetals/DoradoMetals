import { renderMailer } from '#documents/emails/render/base.ts'
import { eyebrow, heading, lede, note, card, button } from '#documents/emails/render/parts.ts'
import { ordersUrl } from '#documents/emails/links.ts'
import { orderLabel } from '#documents/emails/rules.ts'
import type { OrderReceivedMail } from '@dorado/contracts'

// Figma "Mailer · Order received" (6:173). ONE mailer for both directions: it
// replaces purchase_order_created AND sales_order_created, and the lede is what
// changes - a seller is waiting for a label, a buyer is waiting for a parcel.

export function subject(mail: OrderReceivedMail): string {
  return `We've got your order - ${orderLabel(mail.direction, mail.order_number)}`
}

export function render(mail: OrderReceivedMail): string {
  return renderMailer("We've got your order.", [
    eyebrow(`Order ${orderLabel(mail.direction, mail.order_number)}`),
    heading("We've got your order"),
    lede(
      mail.direction === 'sale'
        ? 'Your invoice is attached. We are preparing your order for shipment and will email ' +
            'you the moment it is on its way.'
        : "We'll email you a prepaid label and a packing list — send your metals whenever " +
            "you're ready."
    ),
    card(mail.rows),
    button('Track this order', ordersUrl()),
    note('Questions about this order? Reply to this email and a person will answer.'),
  ])
}
