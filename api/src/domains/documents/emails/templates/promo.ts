import { renderMailer } from '#documents/emails/render/base.ts'
import { eyebrow, heading, lede, note, card, button, stat } from '#documents/emails/render/parts.ts'
import type { PromoMail } from '@dorado/contracts'

// Figma "Mailer · Promo" (154:1083). `service.sendPromo` is its only caller and
// nothing schedules that, until marketing is a thing this codebase does. It is
// the one kind the bounce suppression rule applies to. Every word of it is the
// caller's; the only fixed copy is the disclaimer, which is the part a
// marketing mailer must not lose.

export function subject(mail: PromoMail): string {
  return mail.headline
}

export function render(mail: PromoMail): string {
  return renderMailer(mail.headline, [
    eyebrow(mail.eyebrow),
    heading(mail.headline),
    lede(mail.lede),
    stat(mail.stat_label, mail.stat_value),
    card(mail.rows),
    button('Start a new order', mail.url),
    note(
      'Figures are indicative and move with spot. Your final price is set when we weigh and ' +
        'test the metal.'
    ),
  ])
}
