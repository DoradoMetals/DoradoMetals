import { createElement as h } from 'react'
import { renderMailer, Text, Card, Button } from '@dorado/components/email'
import { maskPhone } from '#shared/text/mask.ts'
import type { VoicemailReceivedMail } from '@dorado/contracts'

export function subject(): string {
  return 'A caller left a voicemail'
}

export function render(mail: VoicemailReceivedMail): string {
  return renderMailer(`A voicemail from ${mail.from_number}.`, [
    h(Text, { variant: 'eyebrow', children: 'Calls' }),
    h(Text, { variant: 'heading', children: 'A caller left a voicemail' }),
    h(Text, {
      variant: 'lede',
      children: 'Nobody was available when they rang the business number.',
    }),
    h(Card, {
      rows: [
        { label: 'From', value: maskPhone(mail.from_number) },
        { label: 'Received', value: mail.received_at },
      ],
    }),
    ...(mail.recording_url
      ? [h(Button, { label: 'Listen to voicemail', href: mail.recording_url })]
      : []),
    h(Text, {
      variant: 'note',
      children:
        "Check the customer's timeline before calling back — they may already have an order with us.",
    }),
  ])
}
