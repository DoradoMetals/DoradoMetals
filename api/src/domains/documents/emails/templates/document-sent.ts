import { createElement as h } from 'react'
import { renderMailer, Text, Card, Button } from '@dorado/components/email'
import { ordersUrl } from '#documents/emails/links.ts'
import { orderLabel, documentLede } from '#documents/emails/rules.ts'
import type { DocumentSentMail } from '@dorado/contracts'

export function subject(mail: DocumentSentMail): string {
  return `Your ${mail.document_label.toLowerCase()} - ${orderLabel(mail.direction, mail.order_number)}`
}

export function render(mail: DocumentSentMail): string {
  return renderMailer(`Your ${mail.document_label.toLowerCase()} is attached.`, [
    h(Text, {
      variant: 'eyebrow',
      children: `Order ${orderLabel(mail.direction, mail.order_number)}`,
    }),
    h(Text, { variant: 'heading', children: `Your ${mail.document_label.toLowerCase()} is ready` }),
    h(Text, { variant: 'lede', children: documentLede(mail.document_label) }),
    h(Card, { rows: mail.rows }),
    h(Button, { label: 'Open document', href: ordersUrl() }),
    h(Text, {
      variant: 'note',
      children: 'Questions about this document? Reply to this email and a person will answer.',
    }),
  ])
}
