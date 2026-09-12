import { createElement as h } from 'react'
import { renderMailer, Text, Card, Button } from '@dorado/components/email'
import { ordersUrl } from '#documents/emails/links.ts'
import { orderLabel } from '#documents/emails/rules.ts'
import type { OrderReceivedMail } from '@dorado/contracts'

export function subject(mail: OrderReceivedMail): string {
  return `We've got your order - ${orderLabel(mail.direction, mail.order_number)}`
}

export function render(mail: OrderReceivedMail): string {
  return renderMailer("We've got your order.", [
    h(Text, {
      variant: 'eyebrow',
      children: `Order ${orderLabel(mail.direction, mail.order_number)}`,
    }),
    h(Text, { variant: 'heading', children: "We've got your order" }),
    h(Text, {
      variant: 'lede',
      children:
        mail.direction === 'sale'
          ? 'Your invoice is attached. We are preparing your order for shipment and will email ' +
            'you the moment it is on its way.'
          : "We'll email you a prepaid label and a packing list — send your metals whenever " +
            "you're ready.",
    }),
    h(Card, { rows: mail.rows }),
    h(Button, { label: 'Track this order', href: ordersUrl() }),
    h(Text, {
      variant: 'note',
      children: 'Questions about this order? Reply to this email and a person will answer.',
    }),
  ])
}
