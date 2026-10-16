import { test } from 'vitest'
import assert from 'node:assert/strict'
import { pdfText } from '#shared/text/pdf-text.ts'
import { textPdf } from '#shared/text/tests/pdf-fixture.ts'

const LINES = ['ELM-88431 · 139.0 g · 58.1% 2.531 oz', 'Total (fine) \\ 2.531 oz']

test('a FlateDecode content stream yields its Tj strings, one line each', async () => {
  const text = await pdfText(textPdf(LINES))
  assert.deepEqual(
    text.split('\n').filter((l) => l.trim() !== ''),
    LINES
  )
})

test('an uncompressed stream and kerned TJ arrays read the same words', async () => {
  const text = await pdfText(textPdf(LINES, { compress: false, kerned: true }))
  assert.match(text, /ELM-88431 · 139\.0 g · 58\.1% 2\.531 oz/)
  assert.match(text, /Total \(fine\) \\ 2\.531 oz/)
})

test('hex strings and octal escapes decode as single bytes', async () => {
  const body = Buffer.from('BT <454C4D2D31> Tj ( \\267 12.0 g) Tj ET', 'latin1')
  const pdf = Buffer.concat([
    Buffer.from(`1 0 obj\n<< /Length ${body.length} >>\nstream\n`),
    body,
    Buffer.from('\nendstream\nendobj\n'),
  ])
  assert.equal((await pdfText(pdf)).trim(), 'ELM-1 · 12.0 g')
})

test('a corrupt deflate stream and a non-PDF read as no text, not an error', async () => {
  const pdf = Buffer.from(
    '1 0 obj\n<< /Filter /FlateDecode >>\nstream\nnot zlib\nendstream\nendobj\n'
  )
  assert.equal(await pdfText(pdf), '')
  assert.equal(await pdfText(Buffer.from('plain text, no streams')), '')
})
