import { test } from 'vitest'
import assert from 'node:assert/strict'
import { padTo } from '#shared/time/floor.ts'

const elapsed = async (fn: () => Promise<unknown>): Promise<number> => {
  const at = Date.now()
  await fn()
  return Date.now() - at
}

test('work faster than the floor is padded up to it', async () => {
  const took = await elapsed(() => padTo(Date.now(), 60))
  assert.ok(took >= 55, `padded to only ${took}ms, which is below the floor`)
})

test('work slower than the floor is not delayed further', async () => {
  const took = await elapsed(() => padTo(Date.now() - 500, 60))
  assert.ok(took < 40, `already past the floor, yet waited ${took}ms`)
})

test('a floor of zero returns at once', async () => {
  assert.ok((await elapsed(() => padTo(Date.now(), 0))) < 40)
})

test('a start in the future waits the floor, never the whole clock skew', async () => {
  const took = await elapsed(() => padTo(Date.now() + 10_000, 60))
  assert.ok(took < 200, `a backwards clock stalled the request for ${took}ms`)
})

test('two branches of unequal work answer at the same floor', async () => {
  const started = Date.now()
  const quick = await elapsed(() => padTo(started, 120))

  const slowStart = Date.now()
  await new Promise((r) => setTimeout(r, 40))
  const slow = await elapsed(async () => {
    await padTo(slowStart, 120)
  })

  assert.ok(quick >= 110 && slow + 40 >= 110, `${quick}ms vs ${slow + 40}ms`)
  assert.ok(Math.abs(quick - (slow + 40)) < 60, 'the two branches are distinguishable by latency')
})
