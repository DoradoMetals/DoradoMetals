import { createElement as h, type ReactNode } from 'react'
import { Eyebrow, Line, pagePalette } from '@dorado/components/document'
import { space } from '@dorado/components/email'
import type { MailerRow } from '@dorado/contracts'

const line = pagePalette.border

const FULFILMENT: MailerRow[] = [
  {
    label: 'Ship it',
    value: 'Prepaid, insured FedEx label — anywhere in the US. Cost is deducted from your payout.',
  },
  {
    label: 'Appointment',
    value:
      'Bring your metals into one of our office locations. Dallas/Fort Worth customers. More coming soon.',
  },
  { label: 'Pickup', value: 'We collect from you. Coming soon.' },
]

function columns(entries: MailerRow[]): ReactNode {
  return h(
    'div',
    { style: { display: 'flex', gap: space.lg } },
    ...entries.map((entry, i) =>
      h(
        'div',
        {
          key: i,
          style: {
            flex: '1 0 0',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          },
        },
        h(Line, { step: 'small', tone: 'ink', weight: 500, children: entry.label }),
        h(Line, { step: 'micro', children: entry.value })
      )
    )
  )
}

function ruled(cap: string, entries: MailerRow[]): ReactNode {
  return h(
    'section',
    {
      style: {
        borderTop: `1px solid ${line}`,
        paddingTop: space.xl,
        display: 'flex',
        flexDirection: 'column',
        gap: space.xs,
        breakInside: 'avoid',
      },
    },
    h(Eyebrow, { children: cap }),
    columns(entries)
  )
}

export function howToSend(): ReactNode {
  return ruled('How To Send It', FULFILMENT)
}

export function gettingPaid(fees: MailerRow[]): ReactNode {
  return ruled('Getting Paid', fees)
}
