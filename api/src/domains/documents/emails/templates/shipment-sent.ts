import { renderMailer } from '#documents/emails/render/base.ts'
import { eyebrow, heading, lede, note, card, button } from '#documents/emails/render/parts.ts'
import { trackingUrl } from '#documents/emails/links.ts'
import { orderLabel } from '#documents/emails/rules.ts'
import type { ShipmentMail } from '@dorado/contracts'

// Figma "Mailer · Shipment sent" (154:808). Sent when the label is bought and
// the parcel takes its first carrier scan.

export function subject(mail: ShipmentMail): string {
  return `Your metals are on the move - ${orderLabel(mail.direction, mail.order_number)}`
}

export function render(mail: ShipmentMail): string {
  return renderMailer('Your parcel is with the carrier.', [
    eyebrow(`Order ${orderLabel(mail.direction, mail.order_number)}`),
    heading('Your metals are on the move'),
    lede("FedEx collected your parcel — we'll email you again the moment it reaches our facility."),
    card(mail.rows),
    button('Track this shipment', trackingUrl(mail.tracking_number)),
    note('Questions about this shipment? Reply to this email and a person will answer.'),
  ])
}
