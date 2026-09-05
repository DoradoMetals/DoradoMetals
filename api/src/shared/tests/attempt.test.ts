import { test } from 'vitest'
import assert from 'node:assert/strict'
import { attempt } from '#shared/attempt.ts'
import { logger } from '#shared/logging/logger.ts'

function captureErrors(): { calls: unknown[][]; restore: () => void } {
  const original = logger.error.bind(logger)
  const calls: unknown[][] = []
  logger.error = ((...args: unknown[]) => {
    calls.push(args)
  }) as unknown as typeof logger.error
  return {
    calls,
    restore: () => {
      logger.error = original
    },
  }
}

test('passes the resolved value through on success', async () => {
  const result = await attempt('send receipt', async () => 42)
  assert.equal(result, 42)
})

test('does not call the logger when fn succeeds', async () => {
  const { calls, restore } = captureErrors()
  try {
    await attempt('send receipt', async () => 'ok')
    assert.equal(calls.length, 0)
  } finally {
    restore()
  }
})

test('returns undefined, not the error, when fn throws', async () => {
  const result = await attempt('send receipt', async () => {
    throw new Error('smtp down')
  })
  assert.equal(result, undefined)
})

test('logs the failure exactly once, naming what failed', async () => {
  const { calls, restore } = captureErrors()
  try {
    const boom = new Error('smtp down')
    await attempt('send receipt', async () => {
      throw boom
    })
    assert.equal(calls.length, 1, 'expected exactly one log call')
    const [fields, message] = calls[0]!
    assert.equal((fields as { err: unknown; what: string }).err, boom)
    assert.equal((fields as { err: unknown; what: string }).what, 'send receipt')
    assert.equal(message, 'send receipt failed')
  } finally {
    restore()
  }
})
