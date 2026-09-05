import { test } from 'vitest'
import assert from 'node:assert/strict'
import path from 'node:path'
import { sqlFrom } from '#shared/db/sql.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { PATCHABLE } from '#db/reviews/repo.ts'

const built = (patch: Record<string, unknown>) =>
  buildUpdate({ table: 'reviews.reviews', allowed: PATCHABLE, patch, where: { id: 'x' } })

const sql = sqlFrom(path.join(import.meta.dirname, '..', '..', '..', 'db', 'reviews'))

const body = (name: string): string =>
  sql(name)
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')

test('every statement loads and is not empty', () => {
  for (const n of ['get_one', 'get_all', 'get_public', 'create', 'delete']) {
    assert.ok(sql(n).trim().length > 0, `${n} is empty`)
  }
})

test('create writes its columns in the order repo.ts supplies them', () => {
  assert.match(
    body('create'),
    /\(name,\s*review_text,\s*rating,\s*hidden\)/,
    'sql/create.sql column order changed - repo.ts builds its params to match'
  )
})

test('no statement writes an audit column', () => {
  const patch = { name: 'n', review_text: 't', rating: 5, hidden: false }
  for (const col of ['created_by', 'updated_by', 'created_by_id', 'updated_by_id', 'updated_at']) {
    assert.doesNotMatch(
      body('create').split('RETURNING')[0],
      new RegExp(`\\b${col}\\b`),
      `create.sql writes ${col} - the trigger owns it`
    )
    assert.doesNotMatch(
      built(patch)!.text,
      new RegExp(`\\b${col}\\b`),
      `the built UPDATE writes ${col} - the trigger owns it`
    )
  }
})

test('the update writes the keys the patch carries, and only those', () => {
  const one = built({ hidden: true })!
  assert.match(one.text, /^UPDATE reviews\.reviews SET hidden = \$1\b/)
  assert.deepEqual(one.values, [true, 'x'])

  const all = built({ name: 'n', review_text: 't', rating: 5, hidden: false })!
  const sets = all.text.split(' WHERE')[0]
  const assignments = [...sets.matchAll(/(\w+) = \$\d+/g)].map(([, c]) => c)
  assert.deepEqual(assignments.slice().sort(), ['hidden', 'name', 'rating', 'review_text'])
})

test('an explicit null is written and an absent key is not', () => {
  const cleared = built({ review_text: null })!
  assert.match(cleared.text, /SET review_text = \$1/)
  assert.deepEqual(cleared.values, [null, 'x'])
  assert.equal(built({}), null, 'an empty patch must not produce a statement')
})

test('the public read filters hidden rows in the statement itself', () => {
  assert.match(body('get_public'), /hidden\s*=\s*false/i)
  assert.doesNotMatch(body('get_public'), /\$\d/, 'get_public takes a parameter - it must not')
  assert.doesNotMatch(
    body('get_all'),
    /hidden\s*=/i,
    'get_all filters on hidden - then it is not get_all'
  )
})

test('no read projects the columns exchange has no equivalent for', () => {
  for (const n of ['get_one', 'get_all', 'get_public', 'create']) {
    for (const col of ['user_id', 'order_id', 'created_by_id', 'updated_by_id']) {
      assert.doesNotMatch(body(n), new RegExp(`\\b${col}\\b`), `${n} projects ${col}`)
    }
  }
})

test('each statement targets the schema its file name claims', () => {
  for (const n of ['get_one', 'get_all', 'get_public', 'create', 'delete']) {
    assert.match(body(n), /reviews\.reviews/, `${n} does not target reviews.reviews`)
    assert.doesNotMatch(body(n), /exchange\./, `${n} touches exchange`)
  }
  assert.match(built({ hidden: true })!.text, /reviews\.reviews/)
})

test('no statement joins another table', () => {
  for (const n of ['get_one', 'get_all', 'get_public', 'create', 'delete']) {
    assert.doesNotMatch(body(n), /\bJOIN\b/i, `${n} joins another table`)
  }
  assert.doesNotMatch(built({ hidden: true })!.text, /\bJOIN\b/i)
})
