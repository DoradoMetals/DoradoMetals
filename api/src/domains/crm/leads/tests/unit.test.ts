import { test } from 'vitest'
import assert from 'node:assert/strict'
import path from 'node:path'
import { sqlFrom } from '#shared/db/sql.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { PATCHABLE } from '#db/leads/repo.ts'

const builtUpdate = (patch: Record<string, unknown> = { priority: 'High' }) =>
  buildUpdate({ table: 'leads.leads', allowed: PATCHABLE, patch, where: { id: 'x' } })!

const sql = sqlFrom(path.join(import.meta.dirname, '..', '..', '..', '..', 'db', 'leads'))

const body = (name: string): string =>
  sql(name)
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')

test('every statement this feature uses loads and is not empty', () => {
  for (const name of ['get_one', 'get_all', 'create', 'delete']) {
    const text = sql(name)
    assert.ok(text.trim().length > 0, `${name} is empty`)
  }
  assert.ok(builtUpdate().text.trim().length > 0, 'the built UPDATE is empty')
})

test('no statement writes an audit column', () => {
  const insert = body('create').split('RETURNING')[0]
  const sets = builtUpdate(Object.fromEntries(PATCHABLE.map((c) => [c, null]))).text.split(
    ' WHERE'
  )[0]
  for (const col of ['created_by', 'updated_by', 'created_at', 'updated_at']) {
    assert.doesNotMatch(insert, new RegExp(`\\b${col}\\b`), `create.sql writes ${col}`)
    assert.doesNotMatch(sets, new RegExp(`\\b${col}\\b`), `the built UPDATE writes ${col}`)
  }
})

test('no read projects the columns exchange has no equivalent for', () => {
  for (const name of ['get_one', 'get_all', 'create']) {
    const text = body(name)
    assert.doesNotMatch(text, /\bcreated_by_id\b/, `${name} projects created_by_id`)
    assert.doesNotMatch(text, /\bupdated_by_id\b/, `${name} projects updated_by_id`)
  }
})

test('the list read is deterministically ordered', () => {
  assert.match(body('get_all'), /ORDER BY\s+created_at DESC,\s*id DESC/i)
})

test('no statement in this feature joins another table', () => {
  for (const name of ['get_one', 'get_all', 'create', 'delete']) {
    assert.doesNotMatch(body(name), /\bJOIN\b/i, `${name} joins another table`)
  }
  assert.doesNotMatch(builtUpdate().text, /\bJOIN\b/i, 'the built UPDATE joins another table')
})

test('each statement targets the schema its file name claims', () => {
  for (const name of ['get_one', 'get_all', 'create', 'delete']) {
    assert.match(body(name), /leads\.leads/, `${name} does not target leads.leads`)
    assert.doesNotMatch(body(name), /exchange\./, `${name} touches exchange`)
  }
  assert.match(builtUpdate().text, /leads\.leads/)
  assert.doesNotMatch(builtUpdate().text, /exchange\./)
})
