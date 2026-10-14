import { createElement as h } from 'react'
import { timedRows } from '#shared/text/time.ts'
import { renderMailer, Text, Card, Button } from '@dorado/components/email'
import { ordersUrl, mediaUrl } from '#documents/emails/links.ts'
import { orderLabel, documentLede } from '#documents/emails/rules.ts'
import type { DocumentSentMail } from '@dorado/contracts'

export function subject(mail: DocumentSentMail): string {
  return `Your ${mail.document_label.toLowerCase()} - ${orderLabel(mail.direction, mail.order_number)}`
}

export function render(mail: DocumentSentMail): string {
  return renderMailer(
    `Your ${mail.document_label.toLowerCase()} is attached.`,
    [
      h(Text, {
        variant: 'heading',
        children: `Your ${mail.document_label.toLowerCase()} is ready`,
      }),
      h(Text, { variant: 'lede', children: documentLede(mail.document_label) }),
      h(Card, { rows: timedRows(mail.rows) }),
      h(Button, { label: 'Open document', href: ordersUrl() }),
      h(Text, {
        variant: 'note',
        children: 'Questions about this document? Reply to this email and a person will answer.',
      }),
    ],
    mediaUrl()
  )
}
