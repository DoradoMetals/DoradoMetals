import { createElement as h } from 'react'
import { renderMailer, Text, Button } from '@dorado/components/email'
import type { AccountCreatedMail } from '@dorado/contracts'

export function subject(): string {
  return 'Welcome to Dorado Metals Exchange'
}

export function render(mail: AccountCreatedMail): string {
  return renderMailer('Your account is ready - finish signing in.', [
    h(Text, { variant: 'eyebrow', children: 'Welcome' }),
    h(Text, { variant: 'heading', children: 'Welcome to Dorado Metals Exchange' }),
    h(Text, {
      variant: 'lede',
      children:
        "Your account is ready. Use the button below to finish signing in — there's no password " +
        'to remember. The link works once and expires in 30 minutes.',
    }),
    h(Button, { label: 'Finish signing in', href: mail.url }),
    h(Text, {
      variant: 'note',
      children: "If you didn't create this account, ignore this email and nothing will happen.",
    }),
  ])
}
