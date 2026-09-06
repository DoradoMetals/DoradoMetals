import { renderMailer } from '#documents/emails/render/base.ts'
import { eyebrow, heading, lede, note, button } from '#documents/emails/render/parts.ts'
import type { AccountCreatedMail } from '@dorado/contracts'

// Figma "Mailer · Account created" (154:954). Copy verbatim from the design.

export function subject(): string {
  return 'Welcome to Dorado Metals Exchange'
}

export function render(mail: AccountCreatedMail): string {
  return renderMailer('Your account is ready - finish signing in.', [
    eyebrow('Welcome'),
    heading('Welcome to Dorado Metals Exchange'),
    lede(
      "Your account is ready. Use the button below to finish signing in — there's no password " +
        'to remember. The link works once and expires in 30 minutes.'
    ),
    button('Finish signing in', mail.url),
    note("If you didn't create this account, ignore this email and nothing will happen."),
  ])
}
