import { createElement as h, type ReactNode } from 'react'
import {
  renderDocument,
  Header,
  Footer,
  Hero,
  Table,
  Summary,
  type TableRow,
  type LedgerLine,
} from '@dorado/components/document'
import { DOCUMENT_FONT_FACES, DOCUMENT_FONT_FAMILY } from '#documents/pdfs/render/assets.ts'

export type ManifestInput = {
  title: string
  eyebrow: string
  reference: string
  heroLabel: string
  heroValue: string
  heroStatus: string
  middle: ReactNode
  rows: TableRow[]
  ledger: LedgerLine[]
  total: string
  issued: string
}

export function buildManifestHtml(input: ManifestInput): string {
  return renderDocument({
    title: input.title,
    head: h(Header, { kind: input.eyebrow, reference: input.reference }),
    body: [
      h(Hero, { label: input.heroLabel, value: input.heroValue, status: input.heroStatus }),
      input.middle,
      h(Table, { cap: 'Items', column: 'Payout', rows: input.rows }),
      h(Summary, { lines: input.ledger, totalLabel: 'Total', total: input.total }),
    ],
    foot: h(Footer, { issued: input.issued }),
    fontFaces: DOCUMENT_FONT_FACES,
    fontFamily: DOCUMENT_FONT_FAMILY,
  })
}

export const ESTIMATE_HERO_LABEL = 'Estimated payout'
export const ESTIMATE_HERO_STATUS =
  'An estimate, not an offer to purchase. Your final payout is set by assay on arrival and moves with spot until it is locked.'
