import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { refusesUnsetDatabaseUrl } from '#pool'

test('an unset DATABASE_URL is refused, production included', () => {
  assert.equal(refusesUnsetDatabaseUrl({}), true)
  assert.equal(
    refusesUnsetDatabaseUrl({ DATABASE_URL: undefined }),
    true,
    'production was the one environment where connecting to the wrong database ' +
      'matters most, and it was the one exempted from the guard'
  )
})

test('a set DATABASE_URL is never refused', () => {
  assert.equal(refusesUnsetDatabaseUrl({ DATABASE_URL: 'postgresql://u:p@h:5432/d' }), false)
})

test('an EMPTY DATABASE_URL counts as unset', () => {
  assert.equal(refusesUnsetDatabaseUrl({ DATABASE_URL: '' }), true)
})

test('env.ts composes DATABASE_URL only when DEV_DATABASE names the database', () => {
  const source = readFileSync(new URL('../src/env.ts', import.meta.url), 'utf8')
  const line = source.split('\n').find((l) => l.includes('DATABASE_URL: ()')) ?? ''
  assert.ok(line, 'the COMPOSED entry for DATABASE_URL was not found')
  assert.ok(
    !/DEV_DATABASE \?\? 'dev'/.test(line),
    'env.ts filled DATABASE_URL in with dev on any host carrying PGHOST, ' +
      "DORADO_USER and DORADO_PASSWORD, which is exactly what pool.ts's refusal " +
      'exists to prevent - the guard could never fire'
  )
  assert.match(line, /process\.env\.DEV_DATABASE\s*\?/)
})
