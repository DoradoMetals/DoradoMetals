import { test } from 'vitest'
import assert from 'node:assert/strict'
import { SettlementParse } from '@dorado/contracts'
import type { SettlementLine } from '@dorado/contracts'
import { pdfText } from '#shared/text/pdf-text.ts'
import { textPdf } from '#shared/text/tests/pdf-fixture.ts'
import { elemetalLines, isElemetal } from '#refining/settlement-parse/elemetal.ts'
import * as rules from '#refining/settlement-parse/rules.ts'

const STATEMENT = [
  'Elemetal Refining LLC - Settlement statement',
  'ELM-88431 · 139.0 g · 58.1% 2.531 oz',
  'ELM-88432 · 60.4 g · 72.6% 1.410 oz',
  'ELM-88433 · Silver · 1,196 g · 92.0%',
  'ELM-88434 · 41.2 g · 61.0% 0.808 oz',
  'Total fine 4.749 oz',
]

const NAMES = 'ABCDS'
const uuid = (name: string): string =>
  `00000000-0000-4000-8000-${String(NAMES.indexOf(name) + 1).padStart(12, '0')}`
const named = (id: string | null): string | null =>
  id === null ? null : NAMES[Number(id.slice(-12)) - 1]!

const lot = (name: string, fine_oz: number | null, extra: Partial<SettlementLine> = {}) =>
  ({
    id: uuid(name),
    lot_id: uuid(name),
    line_reference: null,
    metal_id: 'Gold',
    unit: 'g',
    post_melt: null,
    purity: null,
    matched_lot_id: null,
    status: 'unmatched',
    reference: `RS-2481-${name}`,
    fine_oz,
    matched_reference: null,
    matched_order_reference: null,
    ...extra,
  }) as SettlementLine

test('the Elemetal parser reads reference, weight, unit, purity and fine oz from a text PDF', async () => {
  const text = await pdfText(textPdf(STATEMENT))
  assert.equal(isElemetal(text), true)
  const lines = elemetalLines(text)
  assert.equal(lines.length, 4)
  assert.deepEqual(lines[0], {
    line_reference: 'ELM-88431',
    unit: 'g',
    metal_id: null,
    weight: 139,
    purity: 0.581,
    fine_oz: 2.531,
  })
  assert.equal(lines[2]!.metal_id, 'Silver')
  assert.equal(lines[2]!.weight, 1196)
  assert.equal(lines[2]!.fine_oz, 35.376, 'a line with no printed fine oz is weighed from grams')
  assert.equal(lines[3]!.fine_oz, 0.808, 'the total after the last line is not read as its fine oz')
})

test('text from any other refiner is not Elemetal and parses to no lines', () => {
  const text = 'Acme Assay Co\nLot 77 · 12.0 g · 58.5%'
  assert.equal(isElemetal(text), false)
  assert.deepEqual(elemetalLines(text), [])
  assert.deepEqual(rules.unsupported(), {
    format: null,
    supported: false,
    lines: [],
    not_on_invoice: [],
  })
})

test('a stored line reference wins, then the nearest fine oz in the same metal, one lot per line', async () => {
  const lines = elemetalLines(await pdfText(textPdf(STATEMENT)))
  const parsed = rules.suggested('elemetal', lines, [
    lot('A', 1.0, { line_reference: 'elm-88431' }),
    lot('B', 1.4),
    lot('C', 1.45),
    lot('D', 3.0),
    lot('S', 50, { metal_id: 'Silver' }),
  ])
  assert.doesNotThrow(() => SettlementParse.parse(parsed))
  assert.deepEqual(
    parsed.lines.map((l) => [l.line_reference, named(l.suggested_lot_id), l.status, l.metal_id]),
    [
      ['ELM-88431', 'A', 'matched', 'Gold'],
      ['ELM-88432', 'B', 'matched', 'Gold'],
      ['ELM-88433', null, 'unmatched', 'Silver'],
      ['ELM-88434', null, 'unmatched', null],
    ]
  )
  assert.deepEqual(
    parsed.not_on_invoice.map((l) => named(l.lot_id)),
    ['C', 'D', 'S']
  )
  assert.deepEqual(Object.keys(parsed.not_on_invoice[0]!).sort(), [
    'fine_oz',
    'lot_id',
    'reference',
  ])
})

test('a line with no lot of its metal left is extra', async () => {
  const lines = elemetalLines(await pdfText(textPdf(STATEMENT)))
  const parsed = rules.suggested('elemetal', lines, [lot('A', 2.5)])
  assert.deepEqual(
    parsed.lines.map((l) => [named(l.suggested_lot_id), l.status]),
    [
      ['A', 'matched'],
      [null, 'extra'],
      [null, 'extra'],
      [null, 'extra'],
    ]
  )
  assert.deepEqual(parsed.not_on_invoice, [])
})
