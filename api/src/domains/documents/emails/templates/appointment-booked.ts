import { renderMailer } from '#documents/emails/render/base.ts'
import { eyebrow, heading, lede, note, card, button } from '#documents/emails/render/parts.ts'
import { calendarUrl } from '#documents/emails/links.ts'
import { orderLabel } from '#documents/emails/rules.ts'
import type { ScheduleMail } from '@dorado/contracts'

// Figma "Mailer · Appointment booked" (211:747). "Add to calendar" has to add
// to a calendar, so the button is a Google Calendar template URL built from the
// booking's own start - a plain link, nothing for a client to strip.

export function subject(mail: ScheduleMail): string {
  return `You're booked - ${orderLabel(mail.direction, mail.order_number)}`
}

export function render(mail: ScheduleMail): string {
  return renderMailer('Your appointment is confirmed.', [
    eyebrow(`Order ${orderLabel(mail.direction, mail.order_number)}`),
    heading("You're booked"),
    lede(
      'Bring your items and a photo ID. We weigh and test everything in front of you, and you ' +
        'leave with a finalized price.'
    ),
    card(mail.rows),
    button(
      'Add to calendar',
      calendarUrl('Dorado Metals Exchange appointment', mail.starts_at, mail.venue)
    ),
    note('Running late or need another day? Reply to this email or reschedule from your order.'),
  ])
}
