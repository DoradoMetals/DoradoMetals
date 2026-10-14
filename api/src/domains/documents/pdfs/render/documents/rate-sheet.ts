import { createElement as h, type ReactNode } from 'react'
import {
  renderDocument,
  Header,
  NoteFooter,
  Line,
  pageFont,
  pagePalette,
} from '@dorado/components/document'
import { space, type as textType } from '@dorado/components/email'
import type { RateSheetDocument, RateSheetMetal } from '@dorado/contracts'
import { DOCUMENT_FONT_FACES, DOCUMENT_LOGO } from '#documents/pdfs/render/assets.ts'
import { gettingPaid, howToSend } from '#documents/pdfs/render/documents/send-and-paid.ts'

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
        howToSend(),
        gettingPaid(doc.fees)
      ),
    ],
    foot: h(NoteFooter, { note: note(doc.issued) }),
    footHeight: NOTE_HEIGHT,
    fontFaces: DOCUMENT_FONT_FACES,
    fontFamily: pageFont,
  })
}
