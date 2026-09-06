import { renderMailer } from '#documents/emails/render/base.ts'
import { eyebrow, heading, lede, note, card, button, stat } from '#documents/emails/render/parts.ts'
import { ordersUrl } from '#documents/emails/links.ts'
import { orderLabel, payoutRoute } from '#documents/emails/rules.ts'
import type { PayoutSentMail } from '@dorado/contracts'

// Figma "Mailer · Payout sent" (6:260). Copy verbatim from the design; the
// route sentence names the method and the LAST FOUR only, which is the only
// part of a bank account any document of ours carries.

export function subject(mail: PayoutSentMail): string {
  return `Your payout is on its way - ${orderLabel('purchase', mail.order_number)}`
}

export function render(mail: PayoutSentMail): string {
  return renderMailer(`${mail.amount} is on its way to you.`, [
    eyebrow(`Order ${orderLabel('purchase', mail.order_number)}`),
    heading('Your payout is on its way'),
    lede(payoutRoute(mail.method, mail.account_last4)),
    stat('Amount sent', mail.amount),
    card(mail.rows),
    button('View your invoice', ordersUrl()),
    note('Questions about this payout? Reply to this email and a person will answer.'),
  ])
}
