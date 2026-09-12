import { createElement as h } from 'react'
import { renderMailer, Text, Card, Button, Stat } from '@dorado/components/email'
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
    h(Text, { variant: 'eyebrow', children: `Order ${orderLabel('purchase', mail.order_number)}` }),
    h(Text, { variant: 'heading', children: 'Your payout is on its way' }),
    h(Text, { variant: 'lede', children: payoutRoute(mail.method, mail.account_last4) }),
    h(Stat, { label: 'Amount sent', value: mail.amount }),
    h(Card, { rows: mail.rows }),
    h(Button, { label: 'View your invoice', href: ordersUrl() }),
    h(Text, {
      variant: 'note',
      children: 'Questions about this payout? Reply to this email and a person will answer.',
    }),
  ])
}
