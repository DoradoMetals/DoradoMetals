import { renderMailer } from '#documents/emails/render/base.ts'
import { eyebrow, heading, lede, note, card, button } from '#documents/emails/render/parts.ts'
import { ordersUrl } from '#documents/emails/links.ts'
import { orderLabel } from '#documents/emails/rules.ts'
import type { ShipmentMail } from '@dorado/contracts'

// Figma "Mailer · Shipment received" (154:881). Sent on the delivered scan.

export function subject(mail: ShipmentMail): string {
  return `Your metals arrived - ${orderLabel(mail.direction, mail.order_number)}`
}

export function render(mail: ShipmentMail): string {
  return renderMailer('Your parcel reached our facility.', [
    eyebrow(`Order ${orderLabel(mail.direction, mail.order_number)}`),
    heading('Your metals arrived'),
    lede(
      "Your parcel reached our Dallas facility and is checked in. We're weighing and testing " +
        'it now — pricing usually follows within one business day.'
    ),
    card(mail.rows),
    button('View your order', ordersUrl()),
    note('Questions about this shipment? Reply to this email and a person will answer.'),
  ])
}
