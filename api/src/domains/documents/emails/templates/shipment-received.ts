import { createElement as h } from 'react'
import { renderMailer, Text, Card, Button } from '@dorado/components/email'
import { ordersUrl } from '#documents/emails/links.ts'
import { orderLabel } from '#documents/emails/rules.ts'
import type { ShipmentMail } from '@dorado/contracts'

// Figma "Mailer · Shipment received" (154:881). Sent on the delivered scan.

export function subject(mail: ShipmentMail): string {
  return `Your metals arrived - ${orderLabel(mail.direction, mail.order_number)}`
}

export function render(mail: ShipmentMail): string {
  return renderMailer('Your parcel reached our facility.', [
    h(Text, {
      variant: 'eyebrow',
      children: `Order ${orderLabel(mail.direction, mail.order_number)}`,
    }),
    h(Text, { variant: 'heading', children: 'Your metals arrived' }),
    h(Text, {
      variant: 'lede',
      children:
        "Your parcel reached our Dallas facility and is checked in. We're weighing and testing " +
        'it now — pricing usually follows within one business day.',
    }),
    h(Card, { rows: mail.rows }),
    h(Button, { label: 'View your order', href: ordersUrl() }),
    h(Text, {
      variant: 'note',
      children: 'Questions about this shipment? Reply to this email and a person will answer.',
    }),
  ])
}
