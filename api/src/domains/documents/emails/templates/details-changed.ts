import { renderMailer } from '#documents/emails/render/base.ts'
import { eyebrow, heading, lede, note, card, button } from '#documents/emails/render/parts.ts'
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
    eyebrow('Security'),
    heading('Your sign-in details changed'),
    lede(
      `The ${mail.changed.toLowerCase()} on your account was changed on ${mail.changed_at}. ` +
        "If that was you, there's nothing else to do."
    ),
    card(mail.rows),
    button("This wasn't me", accountUrl()),
    note("Didn't recognise this? Reply to this email and we'll lock the account while we check."),
  ])
}
