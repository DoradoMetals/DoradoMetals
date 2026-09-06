import { test } from 'vitest'
import assert from 'node:assert/strict'
import { firstFile } from '#shared/http/multipart.ts'

const bodyOf = (boundary: string, parts: string[]): Buffer =>
  Buffer.from(parts.map((p) => `--${boundary}\r\n${p}\r\n`).join('') + `--${boundary}--\r\n`)

test('the file part comes back with its filename, type and exact bytes', () => {
  const boundary = 'X-BOUNDARY-1'
  const body = bodyOf(boundary, [
    'Content-Disposition: form-data; name="kind"\r\n\r\nsettlement',
    'Content-Disposition: form-data; name="file"; filename="statement.pdf"\r\n' +
      'Content-Type: application/pdf\r\n\r\n%PDF-1.4 bytes',
  ])

  const file = firstFile(`multipart/form-data; boundary=${boundary}`, body)
  assert.equal(file?.filename, 'statement.pdf')
  assert.equal(file?.content_type, 'application/pdf')
  assert.equal(file?.bytes.toString('utf8'), '%PDF-1.4 bytes')
})

test('a quoted boundary is read, and a body carrying no file answers null', () => {
  const boundary = 'Y-BOUNDARY'
  const withFile = bodyOf(boundary, [
    'Content-Disposition: form-data; name="f"; filename="a.pdf"\r\n\r\nhello',
  ])
  assert.equal(
    firstFile(`multipart/form-data; boundary="${boundary}"`, withFile)?.bytes.toString('utf8'),
    'hello'
  )

  const noFile = bodyOf(boundary, ['Content-Disposition: form-data; name="kind"\r\n\r\ninvoice'])
  assert.equal(firstFile(`multipart/form-data; boundary=${boundary}`, noFile), null)
  assert.equal(firstFile('application/json', Buffer.from('{}')), null)
  assert.equal(firstFile(`multipart/form-data; boundary=${boundary}`, {}), null)
})
