import { createElement as h } from 'react'
import { renderDocument, Header, Footer, Hero, Table, Summary } from '@dorado/components/document'
import type { AssayResultsDocument } from '@dorado/contracts'
import { DOCUMENT_FONT_FACES, DOCUMENT_FONT_FAMILY } from '#documents/pdfs/render/assets.ts'
import { formatIssued } from '#documents/pdfs/render/format.ts'

export function buildAssayResultsHtml(doc: AssayResultsDocument): string {
  return renderDocument({
    title: `Assay Results ${doc.reference}`,
    head: h(Header, { kind: 'Assay Results', reference: doc.reference }),
    body: [
      h(Hero, {
        label: 'Total fine content',
        value: doc.total_fine,
        status: 'Fine metal across every lot.',
      }),
      h(Table, { cap: 'Lots', column: 'Fine content', rows: doc.lots }),
      h(Summary, { lines: doc.by_metal, totalLabel: 'Total', total: doc.total_fine }),
    ],
    foot: h(Footer, { issued: formatIssued() }),
    fontFaces: DOCUMENT_FONT_FACES,
    fontFamily: DOCUMENT_FONT_FAMILY,
  })
}
