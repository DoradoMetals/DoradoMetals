import { renderMailer } from '#documents/emails/render/base.ts'
import { eyebrow, heading, lede, note, card, button } from '#documents/emails/render/parts.ts'
import { ordersUrl } from '#documents/emails/links.ts'
import { orderLabel, documentLede } from '#documents/emails/rules.ts'
import type { DocumentSentMail } from '@dorado/contracts'

// Figma "Mailer · Document sent" (214:904). One shell for every document an
// admin sends from an order - the title, the lede and the card's Document row
// are the document's own, so a new PDF kind needs no new frame and no new file.

export function subject(mail: DocumentSentMail): string {
  return `Your ${mail.document_label.toLowerCase()} - ${orderLabel(mail.direction, mail.order_number)}`
}

export function render(mail: DocumentSentMail): string {
  return renderMailer(`Your ${mail.document_label.toLowerCase()} is attached.`, [
    eyebrow(`Order ${orderLabel(mail.direction, mail.order_number)}`),
    heading(`Your ${mail.document_label.toLowerCase()} is ready`),
    lede(documentLede(mail.document_label)),
    card(mail.rows),
    button('Open document', ordersUrl()),
    note('Questions about this document? Reply to this email and a person will answer.'),
  ])
}
