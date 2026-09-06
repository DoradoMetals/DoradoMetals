import { renderMailer } from '#documents/emails/render/base.ts'
import { eyebrow, heading, lede, note, card, button } from '#documents/emails/render/parts.ts'
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
    eyebrow(`Order ${orderLabel(mail.direction, mail.order_number)}`),
    heading('We have your metals'),
    lede(
      "Your items were collected and sealed. They're on their way to our office and will be " +
        'weighed and tested on arrival — pricing usually follows within one business day.'
    ),
    card(mail.rows),
    button('View your order', ordersUrl()),
    note('Questions about this pickup? Reply to this email and a person will answer.'),
  ])
}
