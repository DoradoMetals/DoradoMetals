import { createElement as h } from 'react'
import { formatClock, timedRows } from '#shared/text/time.ts'
import { renderMailer, Text, Card, Button } from '@dorado/components/email'
import { ordersUrl, mediaUrl } from '#documents/emails/links.ts'
import { orderLabel } from '#documents/emails/rules.ts'
import type { ScheduleMail } from '@dorado/contracts'

function collectedAt(mail: ScheduleMail): string {
  const row = mail.rows.find((entry) => entry.shape === 'zoned' && entry.at)
  return row?.at ? ` at ${formatClock(row.at)}` : ''
}

export function subject(mail: ScheduleMail): string {
  return `We have your metals - ${orderLabel(mail.direction, mail.order_number)}`
}

export function render(mail: ScheduleMail): string {
  return renderMailer(
    'Your items were collected and sealed.',
    [
      h(Text, { variant: 'heading', children: 'We have your metals' }),
      h(Text, {
        variant: 'lede',
        children:
          `Your items were collected${collectedAt(mail)} and sealed. ` +
          "They're on their way to our office and will be " +
          'weighed and tested on arrival — pricing usually follows within one business day.',
      }),
      h(Card, { rows: timedRows(mail.rows) }),
      h(Button, { label: 'View your order', href: ordersUrl() }),
      h(Text, {
        variant: 'note',
        children: 'Questions about this pickup? Reply to this email and a person will answer.',
      }),
    ],
    mediaUrl()
  )
}
