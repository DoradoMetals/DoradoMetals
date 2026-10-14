import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { inRollback } from '#shared/testing/rollback.ts'
import * as spots from '#db/spots/repo.ts'
import * as spotLocks from '#db/orders/spot-locks/repo.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aStaleSpot, aUser, anOrder } from '#shared/testing/builders/index.ts'

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    'these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`'
  )
})

afterAll(async () => {
  await pool.end()
})

test('the board lists every card in metal order and names the stale metals', async () => {
  await inRollback(
    async (c: PoolClient) => {
      await query(`UPDATE spots.current SET seen_at = now()`, [], c)
      await query(`UPDATE spots.current SET dollar_change = -3 WHERE metal_id = 'Silver'`, [], c)
      await aStaleSpot(c, 'Silver')
      const { spots: cards, paused, market_open } = await spots.board(c)
      assert.equal(typeof market_open, 'boolean')
      assert.equal(
        market_open,
        (await query<{ o: boolean }>(`SELECT spots.market_is_open() AS o`, [], c)).rows[0]!.o
      )
      assert.equal(typeof (await spots.metal('Gold', c))?.market_open, 'boolean')
      assert.equal(cards[0]?.id, 'Gold', 'the board is not in metals.metals.sort_order')
      assert.deepEqual(paused, ['Silver'])
      const silver = cards.find((s) => s.id === 'Silver')
      assert.equal(silver?.state, 'stale')
      assert.ok(silver?.bid !== null, 'a stale card stopped pricing from its last good tick')
      assert.equal(silver?.bid, silver?.last_bid)
      assert.equal(silver?.direction, 'down')
      assert.ok(silver?.last_tick_at, 'a card carries no last tick')
    },
    { lock: LOCKS.SPOTS_SETTINGS }
  )
})

test('the metal read carries its source, its state and the adjustment in force', async () => {
  await inRollback(async (c: PoolClient) => {
    await query(`UPDATE spots.current SET seen_at = now()`, [], c)
    const plain = await spots.metal('Gold', c)
    assert.equal(plain?.state, 'live')
    assert.equal(plain?.adjustment, null)
    assert.equal(plain?.mode, null)
    assert.ok(plain?.source_id, 'Gold reads no source')

    await query(
      `INSERT INTO spots.adjustments (metal_id, source_id, bid_amount, ask_amount, reason)
       VALUES ('Gold', $1, -1, 1, 'moved')`,
      [plain?.source_id],
      c
    )
    const adjusted = await spots.metal('Gold', c)
    assert.equal(adjusted?.mode, 'adjust')
    assert.equal(adjusted?.adjustment?.reason, 'moved')
    assert.equal(adjusted?.adjustment?.scope, 'Active')

    await query(`UPDATE spots.adjustments SET mode = 'freeze' WHERE metal_id = 'Gold'`, [], c)
    const frozen = await spots.metal('Gold', c)
    assert.equal(frozen?.state, 'frozen')
    assert.equal(frozen?.adjustment?.mode, 'freeze')
    assert.equal(frozen?.bid, frozen?.adjustment?.frozen_bid)

    assert.equal(await spots.metal('Not A Metal', c), undefined)
  })
})

test('the activity merges locks, adjustments and feed events newest first in a window', async () => {
  await inRollback(
    async (c: PoolClient) => {
      const order = await anOrder(c, await aUser(c), { direction: 'purchase' })
        .withLines({ bullion_id: null, metal_id: 'Gold', content: 1, premium: 1, quantity: 1 })
        .withSpots({ bid: 10, ask: 11 })
      await spotLocks.record(order.id, 'lock', c)
      await query(
        `INSERT INTO spots.adjustments (metal_id, source_id, bid_amount, reason)
       VALUES ('Gold', 'nfusion', -1, 'moved')`,
        [],
        c
      )
      await query(`UPDATE spots.sources SET failed_polls = 1 WHERE id = 'nfusion'`, [], c)

      const rows = await spots.activity('Gold', 7, c)
      const kinds = new Set(rows.map((r) => r.kind))
      assert.ok(kinds.has('lock'), 'the lock is missing from the activity')
      assert.ok(kinds.has('adjustment'), 'the adjustment is missing from the activity')
      assert.ok(kinds.has('source'), 'the feed event is missing from the activity')
      const lock = rows.find((r) => r.kind === 'lock')
      assert.equal(lock?.reference, `PO-${order.number}`)
      assert.equal(lock?.event, 'locked')
      assert.equal(rows.find((r) => r.kind === 'source')?.event, 'feed failed')
      const times = rows.map((r) => new Date(r.at).getTime())
      assert.deepEqual(
        times,
        [...times].sort((a, b) => b - a),
        'the activity is not newest first'
      )

      await query(
        `UPDATE spots.adjustment_history SET changed_at = now() - interval '30 days'
        WHERE metal_id = 'Gold'`,
        [],
        c
      )
      assert.ok(!(await spots.activity('Gold', 7, c)).some((r) => r.kind === 'adjustment'))
    },
    { lock: LOCKS.ORDERS }
  )
})

test('the ticker lists every metal in metal order with the board direction', async () => {
  await inRollback(
    async (c: PoolClient) => {
      await query(`UPDATE spots.current SET seen_at = now()`, [], c)
      await query(`UPDATE spots.current SET dollar_change = -3 WHERE metal_id = 'Silver'`, [], c)
      await query(`UPDATE spots.current SET dollar_change = 0 WHERE metal_id = 'Gold'`, [], c)
      const rows = await spots.ticker(c)
      const { spots: cards } = await spots.board(c)
      assert.deepEqual(
        rows.map((r) => r.metal_id),
        cards.map((s) => s.id)
      )
      assert.equal(rows.find((r) => r.metal_id === 'Silver')?.direction, 'down')
      assert.equal(rows.find((r) => r.metal_id === 'Gold')?.direction, 'flat')
      for (const row of rows) {
        const card = cards.find((s) => s.id === row.metal_id)
        assert.equal(row.price, card?.bid)
        assert.equal(row.direction, card?.direction)
      }
    },
    { lock: LOCKS.SPOTS_SETTINGS }
  )
})
