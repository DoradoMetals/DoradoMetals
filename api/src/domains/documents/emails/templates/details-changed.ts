import { createElement as h } from 'react'
import { renderMailer, Text, Card, Button } from '@dorado/components/email'
import { accountUrl } from '#documents/emails/links.ts'
import type { DetailsChangedMail } from '@dorado/contracts'

// Figma "Mailer · Details changed" (154:1010). Copy verbatim from the design.
// The card's Previous and New rows carry MASKED values - the caller masks them,
// and the render test proves the raw address never reaches the page.
export function subject(): string {
  return 'Your Dorado sign-in details changed'
}

export function render(mail: DetailsChangedMail): string {
  return renderMailer(`${mail.changed} changed on your account.`, [
    h(Text, { variant: 'eyebrow', children: 'Security' }),
    h(Text, { variant: 'heading', children: 'Your sign-in details changed' }),
    h(Text, {
      variant: 'lede',
      children:
        `The ${mail.changed.toLowerCase()} on your account was changed on ${mail.changed_at}. ` +
        "If that was you, there's nothing else to do.",
    }),
    h(Card, { rows: mail.rows }),
    h(Button, { label: "This wasn't me", href: accountUrl() }),
    h(Text, {
      variant: 'note',
      children:
        "Didn't recognise this? Reply to this email and we'll lock the account while we check.",
    }),
  ])
}
