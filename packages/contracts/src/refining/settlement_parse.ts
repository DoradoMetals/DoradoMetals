import { z } from 'zod/v4'

import { Lot } from '../inventory/lots.js'
import { RefiningLot } from './lots.js'

export const SettlementParseFormat = z.enum(['elemetal'])
export type SettlementParseFormat = z.infer<typeof SettlementParseFormat>

export const SettlementParseStatus = z.enum(['matched', 'unmatched', 'extra'])
export type SettlementParseStatus = z.infer<typeof SettlementParseStatus>

export const SettlementStatementLine = z
  .object({
    line_reference: Lot.shape.line_reference.unwrap(),
    unit: Lot.shape.unit,
    metal_id: Lot.shape.metal_id.nullable(),
  })
  .extend({
    weight: z.number(),
    purity: z.number(),
    fine_oz: z.number(),
  })
export type SettlementStatementLine = z.infer<typeof SettlementStatementLine>

export const SettlementParseLine = SettlementStatementLine.extend({
  suggested_lot_id: RefiningLot.shape.lot_id.nullable(),
}).extend({ status: SettlementParseStatus })
export type SettlementParseLine = z.infer<typeof SettlementParseLine>

export const SettlementParseNotOnInvoice = z
  .object({ lot_id: RefiningLot.shape.lot_id })
  .extend({ reference: z.string(), fine_oz: z.number().nullable() })
export type SettlementParseNotOnInvoice = z.infer<typeof SettlementParseNotOnInvoice>

export const SettlementParse = z.object({}).extend({
  format: SettlementParseFormat.nullable(),
  supported: z.boolean(),
  lines: z.array(SettlementParseLine),
  not_on_invoice: z.array(SettlementParseNotOnInvoice),
})
export type SettlementParse = z.infer<typeof SettlementParse>
