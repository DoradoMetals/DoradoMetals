import { createElement as h } from 'react'
import { renderMailer, Text } from '@dorado/components/email'
import { mediaUrl } from '#documents/emails/links.ts'
import type { MailerAddressee } from '@dorado/contracts'

export function subject(label: string): string {
  return `Your ${label} from Dorado Metals`
}

export function render(mail: MailerAddressee, label: string): string {
  return renderMailer(
    `Your ${label} is attached.`,
    [
      h(Text, { variant: 'heading', children: `Your ${label}` }),
      h(Text, { variant: 'lede', children: `Hi ${mail.name}, your ${label} is attached.` }),
      h(Text, {
        variant: 'note',
        children: 'Questions about this document? Reply to this email and a person will answer.',
      }),
    ],
    mediaUrl()
  )
}
