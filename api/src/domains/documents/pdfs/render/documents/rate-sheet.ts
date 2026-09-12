import { createElement as h, type ReactNode } from 'react'
import {
  renderDocument,
  Header,
  Footer,
  Eyebrow,
  Line,
  Rule,
  band,
  bandWith,
  pagePalette,
} from '@dorado/components/document'
import { space, type as textType } from '@dorado/components/email'
import type { RateSheetDocument, RateSheetMetal, MailerRow } from '@dorado/contracts'
import { DOCUMENT_FONT_FACES, DOCUMENT_FONT_FAMILY } from '#documents/pdfs/render/assets.ts'
import { formatIssued } from '#documents/pdfs/render/format.ts'

const ink = pagePalette.foreground
const muted = pagePalette.muted
const line = pagePalette.border

const LEAD = 'What we pay, by metal and weight.'
const SUB =
  'Rates are a percentage of the live spot price at the moment your order is locked. Larger lots earn a higher rate.'

const NOTE =
  'Rates shown are effective September 2026 and are subject to change without notice. Every rate is a percentage of the live spot price at the moment your order is locked.'

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

const FEES: MailerRow[] = [
  { label: 'ACH · direct deposit', value: 'Free · 1–24 hours' },
  { label: 'Wire transfer', value: '$20 · 1–3 hours' },
  { label: 'eCheck', value: 'Free · instant' },
  { label: 'Bullion exchange', value: 'Varies' },
]

function intro(): ReactNode {
  return h(
    'section',
    { style: band },
    h(Line, { step: 'h2', tone: 'ink', children: LEAD }),
    h('div', { style: { paddingTop: space.sm } }, h(Line, { step: 'body', children: SUB }))
  )
}

function metalBand(metal: RateSheetMetal): ReactNode {
  return h(
    'section',
    { style: band },
    h(
      'div',
      {
        style: {
          display: 'flex',
          gap: space.md,
          alignItems: 'flex-end',
          borderBottom: `1px solid ${line}`,
          paddingBottom: space['2xs'],
        },
      },
      h(
        'div',
        { style: { width: '164px' } },
        h(Line, { step: 'h5', tone: 'ink', weight: 600, children: metal.name })
      ),
      ...metal.columns.map((column, i) =>
        h('div', { key: i, style: { flex: '1 0 0' } }, h(Line, { step: 'small', children: column }))
      )
    ),
    ...metal.rows.map((row, ri) =>
      h(
        'div',
        {
          key: ri,
          style: { display: 'flex', gap: space.md, alignItems: 'flex-end', paddingTop: space.sm },
        },
        h('div', { style: { width: '164px' } }, h(Line, { step: 'small', children: row.label })),
        ...row.values.map((value, ci) =>
          h(
            'div',
            { key: ci, style: { flex: '1 0 0' } },
            h('p', { style: textType('h3', { margin: 0, color: ink }) }, value)
          )
        )
      )
    )
  )
}

function columns(entries: MailerRow[]): ReactNode {
  return h(
    'div',
    { style: { display: 'flex', gap: space.lg, paddingTop: space.xs } },
    ...entries.map((entry, i) =>
      h(
        'div',
        { key: i, style: { flex: '1 0 0', minWidth: 0 } },
        h(Line, { step: 'small', tone: 'ink', weight: 500, children: entry.label }),
        h(
          'div',
          { style: { paddingTop: space['3xs'] } },
          h(Line, { step: 'micro', children: entry.value })
        )
      )
    )
  )
}

function fulfilment(): ReactNode {
  return h(
    'section',
    { style: bandWith({ borderTop: `1px solid ${line}`, paddingTop: space.xl }) },
    h(Eyebrow, { children: 'How To Send It' }),
    columns(FULFILMENT)
  )
}

function fees(): ReactNode {
  return h(
    'section',
    { style: bandWith({ borderTop: `1px solid ${line}`, paddingTop: space.xl }) },
    h(Eyebrow, { children: 'Getting Paid' }),
    columns(FEES)
  )
}

function note(): ReactNode {
  return h(
    'section',
    { style: band },
    h(Rule),
    h('div', { style: { paddingTop: space.md } }, h(Line, { step: 'micro', children: NOTE }))
  )
}

export function buildRateSheetHtml(doc: RateSheetDocument): string {
  return renderDocument({
    title: `Rate Sheet ${doc.issued}`,
    head: h(Header, { kind: 'Rate Sheet', reference: doc.issued }),
    body: [intro(), ...doc.metals.map(metalBand), fulfilment(), fees(), note()],
    foot: h(Footer, { issued: formatIssued() }),
    fontFaces: DOCUMENT_FONT_FACES,
    fontFamily: DOCUMENT_FONT_FAMILY,
  })
}
