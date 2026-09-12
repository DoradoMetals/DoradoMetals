import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, anonymous, asAdmin, asUser } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { inPinnedTransaction, outside } from '#shared/testing/pinned-pool.ts'

await mockSessions()
const { default: app } = await import('#app')

type MetalFixture = { metal_id: string; ask: number; bid: number }

let metals: MetalFixture[]

beforeAll(async () => {
  metals = await outside(
    `SELECT s.metal_id, s.ask, s.bid
       FROM spots.spots s
      ORDER BY s.metal_id`
  )
  assert.ok(metals.length > 0, 'dev has no metals - every assertion here would be vacuous')
})

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('the spot feed needs no session at all', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const res = await request(app).get('/api/spots')
        assert.equal(res.status, 200, 'the public spot feed stopped being public')
        assert.ok(Array.isArray(res.body), 'the pricing page expects an array')
        assert.equal(
          res.body.length,
          metals.length,
          'the feed returned a different number of metals than dev holds'
        )
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('every metal carries the fields a quote is built from', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const res = await request(app).get('/api/spots')
        assert.ok(res.body.length > 0, 'the spot feed came back empty')
        for (const spot of res.body) {
          for (const field of ['id', 'ask', 'bid']) {
            assert.ok(field in spot, `a spot is missing ${field}`)
          }
          assert.ok(
            Number.isFinite(Number(spot.ask)),
            `${spot.id} has a non-numeric ask (${spot.ask}) - every quote built on it is wrong`
          )
          assert.ok(
            Number(spot.ask) > 0,
            `${spot.id} has an ask of ${spot.ask}; a zero ask values metal at nothing`
          )
        }
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the asks and bids are the ones in the table, not a transposition of them', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const res = await request(app).get('/api/spots')
        for (const row of metals) {
          const served = res.body.find((s: { id: string }) => s.id === row.metal_id)
          assert.ok(served, `${row.metal_id} is in the table and not in the feed`)
          assert.equal(
            Number(served.ask).toFixed(6),
            Number(row.ask).toFixed(6),
            `${row.metal_id} was served an ask that is not the stored one`
          )
          assert.equal(
            Number(served.bid).toFixed(6),
            Number(row.bid).toFixed(6),
            `${row.metal_id} was served a bid that is not the stored one`
          )
        }
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the public feed carries nothing beyond the quote fields', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const res = await request(app).get('/api/spots')
        const allowed = new Set([
          'id',
          'name',
          'ask',
          'bid',
          'dollar_change',
          'percent_change',
          'direction',
          'updated_at',
          'source',
        ])
        const unexpected = Object.keys(res.body[0] ?? {}).filter((k) => !allowed.has(k))
        assert.deepEqual(
          unexpected,
          [],
          `the public spot feed grew fields nobody vetted: ${unexpected.join(', ')}`
        )
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the feed says which way each metal moved, and a flat day is flat', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const res = await request(app).get('/api/spots')
        assert.ok(res.body.length > 0, 'the spot feed came back empty')
        for (const spot of res.body) {
          const change = spot.dollar_change
          const expected =
            change === null || Number(change) === 0 ? 'flat' : Number(change) > 0 ? 'up' : 'down'
          assert.equal(
            spot.direction,
            expected,
            `${spot.id} moved ${change} and reads ${spot.direction}`
          )
        }
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('every metal carries a source of live, manual or stale, and an updated_at', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const res = await request(app).get('/api/spots')
        assert.ok(res.body.length > 0, 'the spot feed came back empty')
        for (const spot of res.body) {
          assert.ok(
            ['live', 'manual', 'stale'].includes(spot.source),
            `${spot.id} carries an unexpected source: ${spot.source}`
          )
          assert.ok(spot.updated_at, `${spot.id} carries no updated_at`)
        }
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the locks read and the override write are admin-only', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        assert.equal((await request(app).get('/api/spots/locks')).status, 401)
        assert.equal(
          (await request(app).post('/api/spots/Gold/override').send({})).status,
          401
        )
      })
      await asUser(TEST_ACTOR, async () => {
        assert.equal((await request(app).get('/api/spots/locks')).status, 403)
        assert.equal(
          (await request(app).post('/api/spots/Gold/override').send({})).status,
          403
        )
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an admin can set an override, see it read back manual, then remove it', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(TEST_ACTOR, async () => {
        const set = await request(app)
          .post('/api/spots/Silver/override')
          .send({ bid: 30, ask: 31, reason: 'admin test override', expires_at: null })
        assert.equal(set.status, 200, JSON.stringify(set.body))
        assert.equal(set.body.metal_id, 'Silver')

        const feed = await request(app).get('/api/spots')
        const silver = feed.body.find((s: { id: string }) => s.id === 'Silver')
        assert.equal(silver.source, 'manual')

        const removed = await request(app).delete('/api/spots/Silver/override')
        assert.equal(removed.status, 204)

        const again = await request(app).delete('/api/spots/Silver/override')
        assert.equal(again.status, 404)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an admin reads the settings row and can patch the stale threshold', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(TEST_ACTOR, async () => {
        const before = await request(app).get('/api/spots/settings')
        assert.equal(before.status, 200)
        assert.ok(before.body.stale_after_seconds > 0)

        const patched = await request(app)
          .patch('/api/spots/settings')
          .send({ stale_after_seconds: before.body.stale_after_seconds + 5 })
        assert.equal(patched.status, 200)
        assert.equal(patched.body.stale_after_seconds, before.body.stale_after_seconds + 5)
      })
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.SPOTS_SETTINGS }
  )
})
