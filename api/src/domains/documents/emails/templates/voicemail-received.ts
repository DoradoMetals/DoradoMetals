import { renderMailer } from '#documents/emails/render/base.ts'
import { eyebrow, heading, lede, card, button } from '#documents/emails/render/parts.ts'
import type { VoicemailReceivedMail } from '@dorado/contracts'

// No Figma mailer exists for this one: it is an internal notice to staff, on
// the plain base layout, and docs/waves/auth-passwordless.md says so.

export function subject(): string {
  return 'A caller left a voicemail'
}

export function render(mail: VoicemailReceivedMail): string {
  return renderMailer(`A voicemail from ${mail.from_number}.`, [
    eyebrow('Calls'),
    heading('A caller left a voicemail'),
    lede('Nobody was available when they rang the business number.'),
    card([
      { label: 'From', value: mail.from_number },
      { label: 'Received', value: mail.received_at },
    ]),
    ...(mail.recording_url ? [button('Listen to the recording', mail.recording_url)] : []),
  ])
}
