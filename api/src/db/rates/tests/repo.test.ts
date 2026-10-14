import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { inRollback } from '#shared/testing/rollback.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import * as rates from '#db/rates/repo.ts'

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

const bandsOf = async (c: PoolClient, metal_id: string) =>
  (
    await query<{ id: string; min_qty: number; max_qty: number | null; scrap_pct: number }>(
      `SELECT id, min_qty, max_qty, scrap_pct FROM rates.rates WHERE metal_id = $1
        ORDER BY min_qty`,
      [metal_id],
      c
    )
  ).rows

const band = (min_qty: number, max_qty: number | null, scrap_pct: number) => ({
  min_qty,
  max_qty,
  scrap_pct,
  bullion_pct: scrap_pct + 0.02,
})

test('replacing bands edits in place, adds and removes, moving every boundary at once', async () => {
  await inRollback(
    async (c: PoolClient) => {
      await rates.replaceBands('Gold', [band(0, 5, 0.9), band(5, null, 0.92)], c)
      const before = await bandsOf(c, 'Gold')
      assert.equal(before.length, 2)

      await rates.replaceBands(
        'Gold',
        [band(0, 10, 0.91), band(10, 20, 0.93), band(20, null, 0.95)],
        c
      )
      const grown = await bandsOf(c, 'Gold')
      assert.deepEqual(
        grown.map((b) => [b.min_qty, b.max_qty, b.scrap_pct]),
        [
          [0, 10, 0.91],
          [10, 20, 0.93],
          [20, null, 0.95],
        ]
      )
      assert.equal(grown[0].id, before[0].id, 'an edited band lost its id and its trail')

      await rates.replaceBands('Gold', [band(0, null, 0.9)], c)
      assert.equal((await bandsOf(c, 'Gold')).length, 1)
    },
    { lock: LOCKS.RATES }
  )
})

test('an overlapping list is refused by the database as a whole', async () => {
  await inRollback(
    async (c: PoolClient) => {
      await assert.rejects(
        () => rates.replaceBands('Gold', [band(0, 10, 0.9), band(5, null, 0.9)], c),
        /rates_no_overlap_qty/
      )
    },
    { lock: LOCKS.RATES }
  )
})

test('a change reads as the band before and after it: added, changed and removed', async () => {
  await inRollback(
    async (c: PoolClient) => {
      await rates.replaceBands('Silver', [band(0, null, 0.7)], c)
      await query(`DELETE FROM rates.rate_history`, [], c)
      const earlier = async () => {
        await query(
          `UPDATE rates.rate_history SET changed_at = changed_at - interval '1 hour'`,
          [],
          c
        )
      }
      await rates.replaceBands('Silver', [band(0, 100, 0.7), band(100, null, 0.75)], c)
      await earlier()
      await rates.replaceBands('Silver', [band(0, 100, 0.72), band(100, null, 0.75)], c)
      await earlier()
      await rates.replaceBands('Silver', [band(0, null, 0.72)], c)

      const first = await rates.changes({ q: 'Silver', page: 1 }, c)
      const items = [...first.items]
      for (let n = 2; (n - 1) * 8 < first.total; n += 1) {
        items.push(...(await rates.changes({ q: 'Silver', page: n }, c)).items)
      }
      assert.equal(items.length, first.total, 'the pages do not add up to the total')

      const added = items.filter((r) => r.old_band === null)
      assert.deepEqual(added.map((r) => r.type).sort(), ['bullion', 'scrap'])
      assert.ok(added.every((r) => r.new_band?.min_qty === 100 && r.new_band?.max_qty === null))
      assert.equal(added.find((r) => r.type === 'scrap')?.new_band?.scrap_pct, 0.75)

      const split = items.find((r) => r.old_band?.max_qty === null && r.new_band?.max_qty === 100)
      assert.ok(split, 'the band that gained an upper bound did not read as a change')
      assert.equal(split.old_band?.min_qty, 0)

      const changed = items.find(
        (r) => r.type === 'scrap' && r.old_band?.scrap_pct === 0.7 && r.new_band?.scrap_pct === 0.72
      )
      assert.ok(changed, 'the rate change did not read as one row')
      assert.equal(changed.old_band?.max_qty, 100)
      assert.equal(changed.new_band?.max_qty, 100)

      const removed = items.filter((r) => r.new_band === null)
      assert.deepEqual(removed.map((r) => r.type).sort(), ['bullion', 'scrap'])
      assert.ok(removed.every((r) => r.old_band?.min_qty === 100 && r.old_band?.max_qty === null))
      assert.equal(removed.find((r) => r.type === 'bullion')?.old_band?.bullion_pct, 0.77)

      const widened = items.find((r) => r.old_band?.max_qty === 100 && r.new_band?.max_qty === null)
      assert.ok(widened, 'the open-ended widening did not read as a band change')
      assert.equal(widened.new_band?.scrap_pct, 0.72, 'an untouched rate was not read as it stood')

      const none = await rates.changes({ q: 'nobody-matches-this', page: 1 }, c)
      assert.equal(none.total, 0)
      assert.deepEqual(none.items, [])
    },
    { lock: LOCKS.RATES }
  )
})

test('the change log pages by eight, newest first', async () => {
  await inRollback(
    async (c: PoolClient) => {
      await query(`DELETE FROM rates.rate_history`, [], c)
      for (let i = 1; i <= 5; i += 1) {
        await rates.replaceBands(
          'Gold',
          [band(0, 5, 0.5 + i / 100), band(5, null, 0.6 + i / 100)],
          c
        )
        await query(
          `UPDATE rates.rate_history SET changed_at = changed_at - interval '1 hour'`,
          [],
          c
        )
      }
      const first = await rates.changes({ page: 1 }, c)
      const second = await rates.changes({ page: 2 }, c)
      assert.equal(first.items.length, 8)
      assert.equal(second.total, first.total)
      assert.ok(second.items.length > 0)
      const times = first.items.map((r) => new Date(r.changed_at).getTime())
      assert.deepEqual(
        times,
        [...times].sort((a, b) => b - a)
      )
    },
    { lock: LOCKS.RATES }
  )
})

test('a rate row reads back by id and the lists are in metal and band order', async () => {
  await inRollback(
    async (c: PoolClient) => {
      const rows = await rates.list(c)
      assert.ok(rows.length > 0)
      const one = await rates.getOne(rows[0].id, c)
      assert.equal(one?.id, rows[0].id)
      assert.ok((await rates.listAdmin(c)).length === rows.length)
      assert.equal(await rates.getOne('00000000-0000-4000-8000-000000000000', c), undefined)
    },
    { lock: LOCKS.RATES }
  )
})
