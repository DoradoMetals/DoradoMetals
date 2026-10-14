import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { inRollback } from '#shared/testing/rollback.ts'
import * as current from '#db/spots/current/repo.ts'
import * as candles from '#db/spots/candles/repo.ts'
import * as ticks from '#db/spots/ticks/repo.ts'
import * as spots from '#db/spots/repo.ts'
import { LOCKS } from '#shared/testing/locks.ts'

afterAll(async () => {
  await pool.end()
})

const SOURCE = 'nfusion'

const quote = (metal_id: string, bid: number, ask: number) => ({
  metal_id,
  bid,
  ask,
  dollar_change: 1,
  percent_change: 0.1,
})

async function ticksSince(c: PoolClient, metal_id: string): Promise<number> {
  const { rows } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM spots.ticks
      WHERE source_id = $1 AND metal_id = $2 AND at >= now()`,
    [SOURCE, metal_id],
    c
  )
  return rows[0].n
}

async function quoted(c: PoolClient, metal_id: string) {
  const { rows } = await query<{ bid: number; ask: number; at: Date; seen_at: Date }>(
    `SELECT bid, ask, at, seen_at FROM spots.current WHERE source_id = $1 AND metal_id = $2`,
    [SOURCE, metal_id],
    c
  )
  return rows[0]
}

test('a moved pair is quoted, ticked once and opens the minute candle', async () => {
  await inRollback(
    async (c: PoolClient) => {
      await ticks.addPartitions(c)
      assert.equal(await current.upsert(SOURCE, quote('Gold', 2401.5, 2415.25), c), true)

      const row = await quoted(c, 'Gold')
      assert.equal(row.bid, 2401.5)
      assert.equal(row.ask, 2415.25)
      assert.equal(await ticksSince(c, 'Gold'), 1)

      const { rows } = await query<{ open: number; close: number; ticks: number }>(
        `SELECT open, close, ticks FROM spots.candles
          WHERE source_id = $1 AND metal_id = 'Gold' AND interval = '1m'
            AND bucket_start = date_trunc('minute', clock_timestamp(), 'UTC')`,
        [SOURCE],
        c
      )
      assert.equal(rows[0]?.open, 2401.5, 'the open minute candle was not written')
    },
    { lock: LOCKS.SPOTS_SETTINGS }
  )
})

test('a pair that did not move writes no tick and no candle, and only moves seen_at', async () => {
  await inRollback(
    async (c: PoolClient) => {
      await ticks.addPartitions(c)
      await current.upsert(SOURCE, quote('Silver', 30.1, 30.5), c)
      const first = await quoted(c, 'Silver')
      const before = await ticksSince(c, 'Silver')

      assert.equal(await current.upsert(SOURCE, quote('Silver', 30.1, 30.5), c), false)
      const second = await quoted(c, 'Silver')
      assert.equal(await ticksSince(c, 'Silver'), before, 'an unchanged poll appended a tick')
      assert.equal(second.at.getTime(), first.at.getTime(), 'an unchanged poll moved `at`')
      assert.ok(second.seen_at.getTime() > first.seen_at.getTime(), 'seen_at did not move')

      assert.equal(await current.upsert(SOURCE, quote('Silver', 30.2, 30.5), c), true)
      assert.equal(await ticksSince(c, 'Silver'), before + 1)
      const { rows } = await query<{ high: number; low: number; close: number; ticks: number }>(
        `SELECT high, low, close, ticks FROM spots.candles
          WHERE source_id = $1 AND metal_id = 'Silver' AND interval = '1m'
          ORDER BY bucket_start DESC LIMIT 1`,
        [SOURCE],
        c
      )
      assert.equal(rows[0].close, 30.2)
      assert.equal(rows[0].high, 30.2)
    },
    { lock: LOCKS.SPOTS_SETTINGS }
  )
})

test('the resolver derives a change figure for each side off the one move the feed sends', async () => {
  await inRollback(
    async (c: PoolClient) => {
      await ticks.addPartitions(c)
      await current.upsert(
        SOURCE,
        { metal_id: 'Gold', bid: 2000, ask: 2100, dollar_change: 100, percent_change: 5 },
        c
      )
      const row = (await spots.list(c)).find((r) => r.id === 'Gold')
      assert.equal(row?.bid_dollar_change, 100)
      assert.equal(row?.ask_dollar_change, 100)
      assert.equal(Number(row?.bid_percent_change).toFixed(4), ((100 / 1900) * 100).toFixed(4))
      assert.equal(Number(row?.ask_percent_change).toFixed(4), ((100 / 2000) * 100).toFixed(4))
    },
    { lock: LOCKS.SPOTS_SETTINGS }
  )
})

test('a quote for a metal the reference data does not have is refused', async () => {
  await inRollback(async (c: PoolClient) => {
    await ticks.addPartitions(c)
    await assert.rejects(() => current.upsert(SOURCE, quote('Unobtainium', 1, 2), c))
  })
})

test('closed minutes roll into hours and closed hours into days', async () => {
  await inRollback(
    async (c: PoolClient) => {
      await query(
        `DELETE FROM spots.candles WHERE source_id = $1 AND metal_id = 'Platinum'`,
        [SOURCE],
        c
      )
      await query(
        `INSERT INTO spots.candles (source_id, metal_id, interval, bucket_start, open, high, low, close, ticks)
         VALUES ($1, 'Platinum', '1m', '2026-01-05T10:00:00Z', 100, 105, 99, 101, 3),
                ($1, 'Platinum', '1m', '2026-01-05T10:59:00Z', 101, 110, 100, 108, 2),
                ($1, 'Platinum', '1m', '2026-01-05T11:30:00Z', 108, 108, 90, 95, 1)`,
        [SOURCE],
        c
      )
      await candles.roll(SOURCE, 'Platinum', c)

      const { rows } = await query<{
        interval: string
        bucket_start: Date
        open: number
        high: number
        low: number
        close: number
        ticks: number
      }>(
        `SELECT interval, bucket_start, open, high, low, close, ticks FROM spots.candles
          WHERE source_id = $1 AND metal_id = 'Platinum' AND interval IN ('1h', '1d')
          ORDER BY interval DESC, bucket_start`,
        [SOURCE],
        c
      )
      const view = rows.map((r) => [
        r.interval,
        r.bucket_start.toISOString(),
        r.open,
        r.high,
        r.low,
        r.close,
        r.ticks,
      ])
      assert.deepEqual(view, [
        ['1h', '2026-01-05T10:00:00.000Z', 100, 110, 99, 108, 5],
        ['1h', '2026-01-05T11:00:00.000Z', 108, 108, 90, 95, 1],
        ['1d', '2026-01-05T00:00:00.000Z', 100, 110, 90, 95, 6],
      ])

      await query(
        `INSERT INTO spots.candles (source_id, metal_id, interval, bucket_start, open, high, low, close, ticks)
         VALUES ($1, 'Platinum', '1m', '2026-01-05T11:31:00Z', 95, 120, 95, 119, 1)`,
        [SOURCE],
        c
      )
      await candles.roll(SOURCE, 'Platinum', c)
      const day = await query<{ high: number; close: number; ticks: number }>(
        `SELECT high, close, ticks FROM spots.candles
          WHERE source_id = $1 AND metal_id = 'Platinum' AND interval = '1d'`,
        [SOURCE],
        c
      )
      assert.deepEqual(day.rows, [{ high: 120, close: 119, ticks: 7 }])

      const chart = await candles.list('Platinum', SOURCE, '1Y', c)
      assert.deepEqual(
        chart.map((k) => [k.open, k.close]),
        [[100, 119]]
      )
      assert.equal((await candles.list('Platinum', SOURCE, '1D', c)).length, 4)
    },
    { lock: LOCKS.SPOTS_SETTINGS }
  )
})

test('partitions are made ahead and dropped past retention, and old minutes are pruned', async () => {
  await inRollback(
    async (c: PoolClient) => {
      await query(`SELECT spots.add_tick_partitions(now() + interval '3 months')`, [], c)
      const ahead = await query<{ name: string | null }>(
        `SELECT to_regclass('spots.ticks_' || to_char((now() + interval '3 months') AT TIME ZONE 'UTC', 'YYYY_MM'))::text AS name`,
        [],
        c
      )
      assert.ok(ahead.rows[0].name, 'no partition three months ahead')
      assert.equal(await ticks.addPartitions(c), 0, 'a second call made a partition again')

      await query(
        `CREATE TABLE spots.ticks_2001_01 PARTITION OF spots.ticks
           FOR VALUES FROM ('2001-01-01T00:00:00Z') TO ('2001-02-01T00:00:00Z')`,
        [],
        c
      )
      await query(
        `INSERT INTO spots.candles (source_id, metal_id, interval, bucket_start, open, high, low, close, ticks)
         VALUES ($1, 'Gold', '1m', '2001-01-01T00:00:00Z', 1, 1, 1, 1, 1),
                ($1, 'Gold', '1h', '2001-01-01T00:00:00Z', 1, 1, 1, 1, 1)`,
        [SOURCE],
        c
      )
      assert.ok((await ticks.dropExpired(c)) >= 1)
      const gone = await query<{ name: string | null }>(
        `SELECT to_regclass('spots.ticks_2001_01')::text AS name`,
        [],
        c
      )
      assert.equal(gone.rows[0].name, null, 'an expired partition was kept')
      assert.ok((await candles.prune(c)) >= 1)
      const kept = await query<{ interval: string }>(
        `SELECT interval FROM spots.candles WHERE bucket_start = '2001-01-01T00:00:00Z'`,
        [],
        c
      )
      assert.deepEqual(
        kept.rows.map((r) => r.interval),
        ['1h'],
        'retention removed an hour candle or kept a minute'
      )
    },
    { lock: LOCKS.SPOTS_SETTINGS }
  )
})
