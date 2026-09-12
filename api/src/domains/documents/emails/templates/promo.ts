import { createElement as h } from 'react'
import { renderMailer, Text, Card, Button, Stat } from '@dorado/components/email'
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
    h(Text, { variant: 'eyebrow', children: mail.eyebrow }),
    h(Text, { variant: 'heading', children: mail.headline }),
    h(Text, { variant: 'lede', children: mail.lede }),
    h(Stat, { label: mail.stat_label, value: mail.stat_value }),
    h(Card, { rows: mail.rows }),
    h(Button, { label: 'Start a new order', href: mail.url }),
    h(Text, {
      variant: 'note',
      children:
        'Figures are indicative and move with spot. Your final price is set when we weigh and ' +
        'test the metal.',
    }),
  ])
}
