import * as refining from '#refining/service.ts'
import * as delivery from '#documents/pdfs/delivery.ts'
import type { StoredReader } from '#documents/pdfs/serve.ts'
import { pdfText } from '#shared/text/pdf-text.ts'
import { elemetalLines, isElemetal } from '#refining/settlement-parse/elemetal.ts'
import * as rules from '#refining/settlement-parse/rules.ts'
import type { SettlementParse } from '@dorado/contracts'

export async function parseSettlement(
  refining_order_id: string,
  storage?: StoredReader
): Promise<SettlementParse> {
  const document = (await refining.documentsFor(refining_order_id)).find(
    (row) => row.kind === 'settlement'
  )
  rules.assertSettlementImported(document, refining_order_id)
  const bytes = await delivery.downloadRefiningDocument(refining_order_id, 'settlement', storage)
  const text = await pdfText(bytes)
  if (!isElemetal(text)) return rules.unsupported()
  const lots = await refining.settlementLinesFor(refining_order_id)
  return rules.suggested('elemetal', elemetalLines(text), lots)
}
