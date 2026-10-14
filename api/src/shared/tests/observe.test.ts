import { test } from 'vitest'
import assert from 'node:assert/strict'
import { observe } from '#shared/observe.ts'
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

test('hands back the value and logs nothing on success', async () => {
  const { calls, restore } = captureErrors()
  try {
    assert.deepEqual(await observe('poll', async () => 42), { ok: true, value: 42 })
    assert.equal(calls.length, 0)
  } finally {
    restore()
  }
})

test('hands back the error text and logs once on failure', async () => {
  const { calls, restore } = captureErrors()
  try {
    const result = await observe('poll', async () => {
      throw new Error('status 503')
    })
    assert.deepEqual(result, { ok: false, message: 'status 503' })
    assert.equal(calls.length, 1)
  } finally {
    restore()
  }
})

test('a thrown non-error still yields text', async () => {
  const { restore } = captureErrors()
  try {
    const result = await observe('poll', async () => {
      throw 'plain'
    })
    assert.deepEqual(result, { ok: false, message: 'plain' })
  } finally {
    restore()
  }
})
