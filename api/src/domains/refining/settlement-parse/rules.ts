import { Conflict } from '#shared/errors.ts'
import { SettlementParseNotOnInvoice } from '@dorado/contracts'
import type {
  OrderDocument,
  SettlementLine,
  SettlementParse,
  SettlementParseFormat,
  SettlementParseLine,
  SettlementStatementLine,
} from '@dorado/contracts'

const NEAR = 0.1

export function assertSettlementImported(
  document: OrderDocument | undefined,
  refining_order_id: string
): asserts document is OrderDocument {
  if (!document?.available || !document.pdf_id) {
    throw new Conflict(
      `refiner order ${refining_order_id} has no imported settlement - import the refiner's statement first`
    )
  }
}

const sameReference = (lot: SettlementLine, line: SettlementStatementLine): boolean =>
  lot.line_reference !== null &&
  lot.line_reference.trim().toUpperCase() === line.line_reference.trim().toUpperCase()

const sameMetal = (lot: SettlementLine, line: SettlementStatementLine): boolean =>
  line.metal_id === null || line.metal_id === lot.metal_id

const gapOf = (lot: SettlementLine, line: SettlementStatementLine): number | null =>
  lot.fine_oz === null ||
  !sameMetal(lot, line) ||
  Math.abs(lot.fine_oz - line.fine_oz) > lot.fine_oz * NEAR
    ? null
    : Math.abs(lot.fine_oz - line.fine_oz)

export function unsupported(): SettlementParse {
  return { format: null, supported: false, lines: [], not_on_invoice: [] }
}

export function suggested(
  format: SettlementParseFormat,
  statement: SettlementStatementLine[],
  lots: SettlementLine[]
): SettlementParse {
  const claimed = new Set<string>()
  const suggestion: (string | null)[] = statement.map((line) => {
    const lot = lots.find((c) => !claimed.has(c.lot_id) && sameReference(c, line))
    if (lot) claimed.add(lot.lot_id)
    return lot?.lot_id ?? null
  })

  const pairs = statement
    .flatMap((line, index) =>
      suggestion[index] !== null
        ? []
        : lots
            .filter((lot) => !claimed.has(lot.lot_id))
            .map((lot): [number, string, number | null] => [index, lot.lot_id, gapOf(lot, line)])
    )
    .filter((pair): pair is [number, string, number] => pair[2] !== null)
    .sort((a, b) => a[2] - b[2])

  for (const [index, lot_id] of pairs) {
    if (suggestion[index] !== null || claimed.has(lot_id)) continue
    suggestion[index] = lot_id
    claimed.add(lot_id)
  }

  const lines: SettlementParseLine[] = statement.map((line, index) => {
    const suggested_lot_id = suggestion[index] ?? null
    const lot = lots.find((c) => c.lot_id === suggested_lot_id)
    const open = lots.some((c) => !claimed.has(c.lot_id) && sameMetal(c, line))
    return {
      ...line,
      metal_id: line.metal_id ?? lot?.metal_id ?? null,
      suggested_lot_id,
      status: lot ? 'matched' : open ? 'unmatched' : 'extra',
    }
  })

  return {
    format,
    supported: true,
    lines,
    not_on_invoice: lots
      .filter((lot) => !claimed.has(lot.lot_id))
      .map((lot) => SettlementParseNotOnInvoice.parse(lot)),
  }
}
