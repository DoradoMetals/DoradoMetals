import { test } from 'vitest'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sqlFrom } from '#shared/db/sql.ts'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlfrom-'))
fs.mkdirSync(path.join(tmp, 'sql', 'nested'), { recursive: true })
fs.writeFileSync(path.join(tmp, 'sql', 'ok.sql'), 'SELECT 1;\n')
fs.writeFileSync(path.join(tmp, 'sql', 'empty.sql'), '\n\n   \n')
fs.writeFileSync(path.join(tmp, 'sql', 'comments.sql'), '-- just a comment\n-- and another\n')
fs.writeFileSync(path.join(tmp, 'sql', 'nested', 'deep.sql'), 'SELECT 2;\n')

const sql = sqlFrom(tmp)

test('reads a statement by name', () => {
  assert.equal(sql('ok').trim(), 'SELECT 1;')
})

test('reads through a subdirectory', () => {
  assert.equal(sql('nested/deep').trim(), 'SELECT 2;')
})

test('a missing file names the path it looked for', () => {
  assert.throws(() => sql('nope'), /no SQL file at .*nope\.sql/)
})

test('an empty file is refused rather than run', () => {
  assert.throws(() => sql('empty'), /contains no SQL/)
})

test('a file with only comments is refused too', () => {
  assert.throws(() => sql('comments'), /contains no SQL/)
})

test('the second read is served from cache and is identical', () => {
  const a = sql('ok')
  const b = sql('ok')
  assert.equal(a, b)
  fs.writeFileSync(path.join(tmp, 'sql', 'ok.sql'), 'SELECT 999;\n')
  assert.equal(sql('ok'), a, 'the cache was bypassed')
})
