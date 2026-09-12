import { createElement as h } from 'react'
import { renderMailer, Text, Card, Button } from '@dorado/components/email'
import { ordersUrl } from '#documents/emails/links.ts'
import { orderLabel } from '#documents/emails/rules.ts'
import type { ScheduleMail } from '@dorado/contracts'

export function subject(mail: ScheduleMail): string {
  return `Your pickup is booked - ${orderLabel(mail.direction, mail.order_number)}`
}

export function render(mail: ScheduleMail): string {
  return renderMailer('A driver is coming to you.', [
    h(Text, {
      variant: 'eyebrow',
      children: `Order ${orderLabel(mail.direction, mail.order_number)}`,
    }),
    h(Text, { variant: 'heading', children: 'Your pickup is booked' }),
    h(Text, {
      variant: 'lede',
      children:
        'A Dorado driver will collect your metals at the door. Nothing needs wrapping or ' +
        'boxing — just have the items together.',
    }),
    h(Card, { rows: mail.rows }),
    h(Button, { label: 'View your order', href: ordersUrl() }),
    h(Text, {
      variant: 'note',
      children: 'Need a different window? Reply to this email or reschedule from your order.',
    }),
  ])
}
