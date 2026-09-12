import { createElement as h } from 'react'
import { renderMailer, Text, Code } from '@dorado/components/email'
import type { SignInCodeMail } from '@dorado/contracts'

// Figma "Mailer · Sign-in code" (6:107). Copy verbatim from the design.

export function subject(): string {
  return 'Your Dorado sign-in code'
}

export function render(mail: SignInCodeMail): string {
  return renderMailer(`Your sign-in code is ${mail.code}.`, [
    h(Text, { variant: 'eyebrow', children: 'Security' }),
    h(Text, { variant: 'heading', children: 'Your sign-in code' }),
    h(Text, {
      variant: 'lede',
      children:
        "Enter the code in the browser you're signing in from. If you didn't ask for it, you can " +
        'safely ignore this email — nobody can reach your account without it.',
    }),
    h(Code, {
      value: mail.code,
      expiry: `This code expires in ${mail.expires_in_minutes} minutes.`,
    }),
    h(Text, {
      variant: 'note',
      children: 'Questions? Reply to this email and a person will answer.',
    }),
  ])
}
