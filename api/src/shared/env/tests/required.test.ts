import { test } from 'vitest'
import assert from 'node:assert/strict'
import { requiredEnv } from '#shared/env/required.ts'

const withEnv = <T>(name: string, value: string | undefined, fn: () => T): T => {
  const had = Object.prototype.hasOwnProperty.call(process.env, name)
  const before = process.env[name]
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
  try {
    return fn()
  } finally {
    if (had) process.env[name] = before
    else delete process.env[name]
  }
}

const NAME = 'DORADO_REQUIRED_ENV_FIXTURE'

test('returns the value when it is set', () => {
  withEnv(NAME, 'a-value', () => {
    assert.equal(requiredEnv(NAME), 'a-value')
  })
})

test('throws when it is unset, and the message names the variable', () => {
  withEnv(NAME, undefined, () => {
    assert.throws(
      () => requiredEnv(NAME),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.match(err.message, new RegExp(NAME))
        return true
      }
    )
  })
})

test('an empty string counts as missing, not as a value', () => {
  withEnv(NAME, '', () => {
    assert.throws(() => requiredEnv(NAME), new RegExp(NAME))
  })
})

test('the message never carries the value', () => {
  const secret = 'sk_live_THIS_MUST_NEVER_APPEAR'
  withEnv(NAME, secret, () => {
    assert.equal(requiredEnv(NAME), secret)
  })
  for (const empty of ['', undefined]) {
    withEnv(NAME, empty, () => {
      try {
        requiredEnv(NAME)
        assert.fail('should have thrown')
      } catch (err) {
        assert.ok(err instanceof Error)
        assert.doesNotMatch(err.message, /sk_live/)
      }
    })
  }
})

test('each variable is read by name, not cached from a previous call', () => {
  withEnv(NAME, 'first', () => assert.equal(requiredEnv(NAME), 'first'))
  withEnv(NAME, 'second', () => assert.equal(requiredEnv(NAME), 'second'))
})
