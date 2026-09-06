import { test } from 'vitest'
import assert from 'node:assert/strict'
import { databaseNameOf, isSafeName } from '../safe-database.ts'

const url = (name: string) => `postgresql://u:p@host:5432/${name}`

test('the seeds run against dev, test and a per-branch test database', () => {
  for (const name of ['dev', 'test', 'test_fixb_lane', 'test_a1']) {
    assert.equal(isSafeName(name), true, `${name} must be allowed`)
  }
})

test('anything else is refused, prod and a renamed database included', () => {
  for (const name of ['prod', 'production', 'dorado', 'dev2', 'Test', '', 'testing']) {
    assert.equal(isSafeName(name), false, `${name} must be refused`)
  }
})

test('the name is read from the URL path, and an unparsable URL names nothing', () => {
  assert.equal(databaseNameOf(url('test_fixb_lane')), 'test_fixb_lane')
  assert.equal(databaseNameOf('not a url'), '')
  assert.equal(databaseNameOf(undefined), '')
  assert.equal(isSafeName(databaseNameOf(url('prod'))), false)
})
