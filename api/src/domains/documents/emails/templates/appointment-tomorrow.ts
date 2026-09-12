import { createElement as h } from 'react'
import { renderMailer, Text, Card, Button } from '@dorado/components/email'
import { directionsUrl } from '#documents/emails/links.ts'
import { orderLabel } from '#documents/emails/rules.ts'
import type { ScheduleMail } from '@dorado/contracts'

// Figma "Mailer · Appointment tomorrow" (211:790). The one SCHEDULED mailer -
// a daily job sends it, and the paper trail is what stops it being sent twice.
export function subject(mail: ScheduleMail): string {
  return `See you tomorrow - ${orderLabel(mail.direction, mail.order_number)}`
}

export function render(mail: ScheduleMail): string {
  return renderMailer('A reminder about your appointment tomorrow.', [
    h(Text, {
      variant: 'eyebrow',
      children: `Order ${orderLabel(mail.direction, mail.order_number)}`,
    }),
    h(Text, { variant: 'heading', children: 'See you tomorrow' }),
    h(Text, {
      variant: 'lede',
      children:
        'A quick reminder about your appointment. Most visits take under thirty minutes; ' +
        'parking is free at the door.',
    }),
    h(Card, { rows: mail.rows }),
    h(Button, { label: 'Get directions', href: directionsUrl(mail.venue) }),
    h(Text, {
      variant: 'note',
      children:
        "Can't make it? Reply to this email or reschedule from your order — same-day changes " +
        'are fine.',
    }),
  ])
}
