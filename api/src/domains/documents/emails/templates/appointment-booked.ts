import { createElement as h } from 'react'
import { renderMailer, Text, Card, Button } from '@dorado/components/email'
import { calendarUrl } from '#documents/emails/links.ts'
import { orderLabel } from '#documents/emails/rules.ts'
import type { ScheduleMail } from '@dorado/contracts'

export function subject(mail: ScheduleMail): string {
  return `You're booked - ${orderLabel(mail.direction, mail.order_number)}`
}

export function render(mail: ScheduleMail): string {
  return renderMailer('Your appointment is confirmed.', [
    h(Text, {
      variant: 'eyebrow',
      children: `Order ${orderLabel(mail.direction, mail.order_number)}`,
    }),
    h(Text, { variant: 'heading', children: "You're booked" }),
    h(Text, {
      variant: 'lede',
      children:
        'Bring your items and a photo ID. We weigh and test everything in front of you, and you ' +
        'leave with a finalized price.',
    }),
    h(Card, { rows: mail.rows }),
    h(Button, {
      label: 'Add to calendar',
      href: calendarUrl('Dorado Metals Exchange appointment', mail.starts_at, mail.venue),
    }),
    h(Text, {
      variant: 'note',
      children:
        'Running late or need another day? Reply to this email or reschedule from your order.',
    }),
  ])
}
