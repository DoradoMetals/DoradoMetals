import { renderMailer } from '#documents/emails/render/base.ts'
import { eyebrow, heading, lede, note, card, button } from '#documents/emails/render/parts.ts'
import { ordersUrl } from '#documents/emails/links.ts'
import { orderLabel } from '#documents/emails/rules.ts'
import type { ScheduleMail } from '@dorado/contracts'

// Figma "Mailer · Pickup booked" (211:659).

export function subject(mail: ScheduleMail): string {
  return `Your pickup is booked - ${orderLabel(mail.direction, mail.order_number)}`
}

export function render(mail: ScheduleMail): string {
  return renderMailer('A driver is coming to you.', [
    eyebrow(`Order ${orderLabel(mail.direction, mail.order_number)}`),
    heading('Your pickup is booked'),
    lede(
      'A Dorado driver will collect your metals at the door. Nothing needs wrapping or ' +
        'boxing — just have the items together.'
    ),
    card(mail.rows),
    button('View your order', ordersUrl()),
    note('Need a different window? Reply to this email or reschedule from your order.'),
  ])
}
