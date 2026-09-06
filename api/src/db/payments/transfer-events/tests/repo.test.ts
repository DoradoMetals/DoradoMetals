import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import * as events from '#db/payments/transfer-events/repo.ts'

beforeAll(() => {
  assert.equal(new Date().getTimezoneOffset(), 0, 'these tests require TZ=UTC')
})
afterAll(async () => {
  await pool.end()
})

const delivery = (event_id: string) => ({
  transfer_id: null,
  provider: 'moov',
  event_id,
  event_type: 'transfer.updated',
  provider_ref: 'xfer_000001',
  reported_state: null,
  failure_reason: null,
  occurred_at: '2026-09-06T00:00:00.000Z',
})

test('a delivery is recorded once and the replay writes nothing', async () => {
  await inRollback(async (c) => {
    const first = await events.record(delivery('evt_replay'), c)
    assert.ok(first)
    assert.equal(await events.record(delivery('evt_replay'), c), undefined)
  })
})

test('the same event id from another provider is a different event', async () => {
  await inRollback(async (c) => {
    assert.ok(await events.record(delivery('evt_shared'), c))
    const stripe = { ...delivery('evt_shared'), provider: 'stripe' }
    assert.ok(await events.record(stripe, c))
  })
})

test('an event is attached to its transfer and says whether it was applied', async () => {
  await inRollback(async (c) => {
    const recorded = await events.record(delivery('evt_attach'), c)
    assert.ok(recorded)
    assert.equal(recorded.applied, false)
    assert.equal(await events.attach(recorded.id, null, true, c), true)
    assert.equal((await events.getOne(recorded.id, c))?.applied, true)
  })
})
