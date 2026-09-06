import { renderMailer } from '#documents/emails/render/base.ts'
import { eyebrow, heading, lede, note, card, button } from '#documents/emails/render/parts.ts'
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
    eyebrow(`Order ${orderLabel(mail.direction, mail.order_number)}`),
    heading('See you tomorrow'),
    lede(
      'A quick reminder about your appointment. Most visits take under thirty minutes; ' +
        'parking is free at the door.'
    ),
    card(mail.rows),
    button('Get directions', directionsUrl(mail.venue)),
    note(
      "Can't make it? Reply to this email or reschedule from your order — same-day changes " +
        'are fine.'
    ),
  ])
}
