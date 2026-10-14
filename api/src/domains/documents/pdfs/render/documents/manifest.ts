import { createElement as h, type ReactNode } from 'react'
import { Hero, Table, Summary, type TableRow, type LedgerLine } from '@dorado/components/document'
import { documentHtml } from '#documents/pdfs/render/documents/page.ts'

export type ManifestInput = {
  title: string
  eyebrow: string
  reference: string
  heroLabel: string
  heroValue: string
  heroStatus: string
  middle: ReactNode
  tableCap: string
  tableColumn: string
  rows: TableRow[]
  ledger: LedgerLine[]
  total: string
  footer: string
}

export function buildManifestHtml(input: ManifestInput): string {
  return documentHtml({
    title: input.title,
    kind: input.eyebrow,
    reference: input.reference,
    body: [
      h(Hero, { label: input.heroLabel, value: input.heroValue, status: input.heroStatus }),
      input.middle,
      h(Table, { cap: input.tableCap, column: input.tableColumn, rows: input.rows }),
      h(Summary, { lines: input.ledger, totalLabel: 'Total', total: input.total }),
    ],
    footer: input.footer,
  })
}

export const ESTIMATE_HERO_LABEL = 'Estimated payout'
export const ESTIMATE_HERO_STATUS =
  'An estimate is not an offer to purchase and is subject to change based on spot movement and final assay.'
