import { createElement as h, type ReactNode } from 'react'
import {
  renderDocument,
  Header,
  NoteFooter,
  Eyebrow,
  Line,
  pageFont,
  pagePalette,
} from '@dorado/components/document'
import { space, type as textType } from '@dorado/components/email'
import type { RateSheetDocument, RateSheetMetal, MailerRow } from '@dorado/contracts'
import { DOCUMENT_FONT_FACES, DOCUMENT_LOGO } from '#documents/pdfs/render/assets.ts'

const ink = pagePalette.foreground
const line = pagePalette.border
const SIDE = '64px'
const LABEL_WIDTH = '164px'
const NOTE_HEIGHT = 100

const LEAD = 'What we pay, by metal and weight.'
const SUB =
  'Rates are a percentage of the live spot price at the moment your order is locked. Larger lots earn a higher rate.'

const note = (issued: string): string =>
  `Rates shown are effective ${issued} and are subject to change without notice. Every rate is a percentage of the live spot price at the moment your order is locked.`

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

function intro(): ReactNode {
  return h(
    'section',
    { style: { display: 'flex', flexDirection: 'column', gap: space['2xs'] } },
    h(Line, { step: 'h2', tone: 'ink', children: LEAD }),
    h(Line, { step: 'small', children: SUB })
  )
}

function metalBand(metal: RateSheetMetal): ReactNode {
  const row = {
    display: 'flex',
    gap: space.md,
    alignItems: 'flex-end',
    padding: `${space['2xs']} 0`,
  } as const
  const head = {
    display: 'flex',
    gap: space.md,
    alignItems: 'flex-end',
    padding: `${space['2xs']} 0`,
    borderBottom: `1px solid ${line}`,
  } as const
  return h(
    'div',
    {
      key: metal.name,
      style: { display: 'flex', flexDirection: 'column', gap: space.sm, breakInside: 'avoid' },
    },
    h(
      'div',
      { style: head },
      h(
        'div',
        { style: { width: LABEL_WIDTH, flex: `0 0 ${LABEL_WIDTH}` } },
        h(
          'p',
          {
            style: textType('small', {
              margin: 0,
              color: ink,
              fontSize: '14px',
              lineHeight: '21px',
              fontWeight: 600,
            }),
          },
          metal.name
        )
      ),
      ...metal.columns.map((column, i) =>
        h('div', { key: i, style: { flex: '1 0 0' } }, h(Line, { step: 'small', children: column }))
      )
    ),
    ...metal.rows.map((entry, ri) =>
      h(
        'div',
        { key: ri, style: row },
        h(
          'div',
          { style: { width: LABEL_WIDTH, flex: `0 0 ${LABEL_WIDTH}` } },
          h(Line, { step: 'small', children: entry.label })
        ),
        ...entry.values.map((value, ci) =>
          h(
            'div',
            { key: ci, style: { flex: '1 0 0' } },
            h(Line, { step: 'h3', tone: 'ink', children: value })
          )
        )
      )
    )
  )
}

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

export function buildRateSheetHtml(doc: RateSheetDocument): string {
  return renderDocument({
    title: `Rate Sheet ${doc.issued}`,
    head: h(Header, {
      kind: 'Rate Sheet',
      reference: doc.issued,
      logo: DOCUMENT_LOGO,
      density: 'roomy',
    }),
    body: [
      h(
        'main',
        {
          key: 'body',
          style: {
            padding: `${space.xs} ${SIDE}`,
            display: 'flex',
            flexDirection: 'column',
            gap: space.xl,
          },
        },
        intro(),
        h(
          'section',
          { style: { display: 'flex', flexDirection: 'column', gap: space.md } },
          ...doc.metals.map(metalBand)
        ),
        ruled('How To Send It', FULFILMENT),
        ruled('Getting Paid', doc.fees)
      ),
    ],
    foot: h(NoteFooter, { note: note(doc.issued) }),
    footHeight: NOTE_HEIGHT,
    fontFaces: DOCUMENT_FONT_FACES,
    fontFamily: pageFont,
  })
}
