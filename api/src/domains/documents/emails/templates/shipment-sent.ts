import { createElement as h } from 'react'
import { renderMailer, Text, Card, Button } from '@dorado/components/email'
import { trackingUrl } from '#documents/emails/links.ts'
import { orderLabel } from '#documents/emails/rules.ts'
import type { ShipmentMail } from '@dorado/contracts'

export function subject(mail: ShipmentMail): string {
  return `Your metals are on the move - ${orderLabel(mail.direction, mail.order_number)}`
}

export function render(mail: ShipmentMail): string {
  return renderMailer('Your parcel is with the carrier.', [
    h(Text, {
      variant: 'eyebrow',
      children: `Order ${orderLabel(mail.direction, mail.order_number)}`,
    }),
    h(Text, { variant: 'heading', children: 'Your metals are on the move' }),
    h(Text, {
      variant: 'lede',
      children:
        "FedEx collected your parcel — we'll email you again the moment it reaches our facility.",
    }),
    h(Card, { rows: mail.rows }),
    h(Button, { label: 'Track this shipment', href: trackingUrl(mail.tracking_number) }),
    h(Text, {
      variant: 'note',
      children: 'Questions about this shipment? Reply to this email and a person will answer.',
    }),
  ])
}
