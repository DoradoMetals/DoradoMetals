import { createElement as h } from 'react'
import { renderMailer, Text, Card, Button } from '@dorado/components/email'
import { ordersUrl } from '#documents/emails/links.ts'
import { orderLabel } from '#documents/emails/rules.ts'
import type { ScheduleMail } from '@dorado/contracts'

// Figma "Mailer · Pickup complete" (211:704). The design's lede names the
// driver and the minute; both are facts of the booking, so they are card rows
// here and the sentence says what happened without pretending to know them.
export function subject(mail: ScheduleMail): string {
  return `We have your metals - ${orderLabel(mail.direction, mail.order_number)}`
}

export function render(mail: ScheduleMail): string {
  return renderMailer('Your items were collected and sealed.', [
    h(Text, {
      variant: 'eyebrow',
      children: `Order ${orderLabel(mail.direction, mail.order_number)}`,
    }),
    h(Text, { variant: 'heading', children: 'We have your metals' }),
    h(Text, {
      variant: 'lede',
      children:
        "Your items were collected and sealed. They're on their way to our office and will be " +
        'weighed and tested on arrival — pricing usually follows within one business day.',
    }),
    h(Card, { rows: mail.rows }),
    h(Button, { label: 'View your order', href: ordersUrl() }),
    h(Text, {
      variant: 'note',
      children: 'Questions about this pickup? Reply to this email and a person will answer.',
    }),
  ])
}
