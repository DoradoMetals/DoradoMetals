import { createElement as h } from 'react'
import { renderMailer, Text, Card, Button, Stat } from '@dorado/components/email'
import type { PromoMail } from '@dorado/contracts'

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
