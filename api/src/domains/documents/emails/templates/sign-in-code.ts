import { renderMailer } from '#documents/emails/render/base.ts'
import { eyebrow, heading, lede, note, code } from '#documents/emails/render/parts.ts'
import type { SignInCodeMail } from '@dorado/contracts'

// Figma "Mailer · Sign-in code" (6:107). Copy verbatim from the design.

export function subject(): string {
  return 'Your Dorado sign-in code'
}

export function render(mail: SignInCodeMail): string {
  return renderMailer(`Your sign-in code is ${mail.code}.`, [
    eyebrow('Security'),
    heading('Your sign-in code'),
    lede(
      "Enter the code in the browser you're signing in from. If you didn't ask for it, you can " +
        'safely ignore this email — nobody can reach your account without it.'
    ),
    code(mail.code, `This code expires in ${mail.expires_in_minutes} minutes.`),
    note('Questions? Reply to this email and a person will answer.'),
  ])
}
