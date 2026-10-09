import { test, vi, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import {
  mockSessions,
  restoreSessions,
  anonymous,
  asAdmin,
  asUser,
} from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { inPinnedTransaction, outside } from '#shared/testing/pinned-pool.ts'

vi.mock('#providers/nfusion/feed.ts', () => ({ SOURCE_ID: 'nfusion', fetchQuotes: vi.fn() }))

import { SOURCE_ID, fetchQuotes } from '#providers/nfusion/feed.ts'

await mockSessions()
const { default: app } = await import('#app')

type MetalFixture = { metal_id: string; ask: number; bid: number }

let metals: MetalFixture[]

beforeAll(async () => {
  metals = await outside(
    `SELECT r.metal_id, r.ask, r.bid
       FROM spots.resolved r
      ORDER BY r.metal_id`
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

test('the asks and bids are the resolved ones, not a transposition of them', async () => {
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
            `${row.metal_id} was served an ask that is not the resolved one`
          )
          assert.equal(
            Number(served.bid).toFixed(6),
            Number(row.bid).toFixed(6),
            `${row.metal_id} was served a bid that is not the resolved one`
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
          'bid_dollar_change',
          'bid_percent_change',
          'ask_dollar_change',
          'ask_percent_change',
          'direction',
          'updated_at',
          'state',
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

test('every metal carries a state of live, manual or stale, and an updated_at', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const res = await request(app).get('/api/spots')
        assert.ok(res.body.length > 0, 'the spot feed came back empty')
        for (const spot of res.body) {
          assert.ok(
            ['live', 'manual', 'stale'].includes(spot.state),
            `${spot.id} carries an unexpected state: ${spot.state}`
          )
          assert.ok(spot.updated_at, `${spot.id} carries no updated_at`)
        }
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('every internal spot endpoint is admin-only', async () => {
  const admin = [
    ['get', '/api/spots/locks'],
    ['get', '/api/spots/sources'],
    ['get', '/api/spots/adjustments'],
    ['get', '/api/spots/adjustments/history'],
    ['get', '/api/spots/metals/active-sources'],
    ['patch', '/api/spots/sources/nfusion'],
    ['patch', '/api/spots/metals/Gold/active-source'],
    ['patch', '/api/spots/adjustments/Gold/nfusion'],
    ['delete', '/api/spots/adjustments/Gold/nfusion'],
    ['post', '/api/spots/refresh'],
  ] as const

  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        for (const [verb, url] of admin) {
          const res = await request(app)[verb](url).send({})
          assert.equal(res.status, 401, `${verb.toUpperCase()} ${url} is reachable with no session`)
        }
      })
      await asUser(TEST_ACTOR, async () => {
        for (const [verb, url] of admin) {
          const res = await request(app)[verb](url).send({})
          assert.equal(res.status, 403, `${verb.toUpperCase()} ${url} is reachable by a customer`)
        }
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an admin reads the sources with their derived status and patches one', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(TEST_ACTOR, async () => {
        const list = await request(app).get('/api/spots/sources')
        assert.equal(list.status, 200, JSON.stringify(list.body))
        const source = list.body.find((s: { id: string }) => s.id === SOURCE_ID)
        assert.ok(source, 'the seeded feed is missing from the sources list')
        assert.equal(source.status, 'Live')
        assert.ok(Array.isArray(source.metal_ids))

        const patched = await request(app)
          .patch(`/api/spots/sources/${SOURCE_ID}`)
          .send({ sort_order: 7 })
        assert.equal(patched.status, 200, JSON.stringify(patched.body))
        assert.equal(patched.body.sort_order, 7)

        const missing = await request(app).patch('/api/spots/sources/nope').send({ enabled: true })
        assert.equal(missing.status, 404, 'patching a feed that does not exist was accepted')
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an admin sets an adjustment, reads it back manual, logs it and clears it', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(TEST_ACTOR, async () => {
        const set = await request(app)
          .patch(`/api/spots/adjustments/Silver/${SOURCE_ID}`)
          .send({ bid_amount: -0.2, ask_amount: 0.2, reason: 'admin test adjustment' })
        assert.equal(set.status, 200, JSON.stringify(set.body))
        assert.equal(set.body.metal_id, 'Silver')
        assert.equal(set.body.scope, 'Active')

        const feed = await request(app).get('/api/spots')
        const silver = feed.body.find((s: { id: string }) => s.id === 'Silver')
        assert.equal(silver.state, 'manual')

        const log = await request(app).get('/api/spots/adjustments/history?metal_id=Silver')
        assert.equal(log.status, 200)
        assert.ok(log.body.length > 0, 'the adjustment left no history row')
        assert.equal(log.body[0].actor_name, TEST_ACTOR.name)

        const removed = await request(app).delete(`/api/spots/adjustments/Silver/${SOURCE_ID}`)
        assert.equal(removed.status, 204)

        const again = await request(app).delete(`/api/spots/adjustments/Silver/${SOURCE_ID}`)
        assert.equal(again.status, 404)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an unknown adjustment field is refused at the transport', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(TEST_ACTOR, async () => {
        const res = await request(app)
          .patch(`/api/spots/adjustments/Silver/${SOURCE_ID}`)
          .send({ bid: 30, reason: 'the old absolute shape' })
        assert.equal(res.status, 400, 'the retired override shape was accepted')
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the retired override routes are gone', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(TEST_ACTOR, async () => {
        assert.equal((await request(app).post('/api/spots/Gold/override').send({})).status, 404)
        assert.equal((await request(app).delete('/api/spots/Gold/override')).status, 404)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an admin can run the feed once from the API', async () => {
  vi.mocked(fetchQuotes).mockResolvedValueOnce(
    new Map([['Gold', { ask: 2345.67, bid: 2344.56, dollar_change: 1, percent_change: 0.1 }]])
  )

  await inPinnedTransaction(
    async () => {
      await asAdmin(TEST_ACTOR, async () => {
        const res = await request(app).post('/api/spots/refresh')
        assert.equal(res.status, 200, JSON.stringify(res.body))
        const gold = res.body.find((s: { id: string }) => s.id === 'Gold')
        assert.equal(Number(gold.bid).toFixed(2), '2344.56')
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
        assert.ok(before.body.tick_seconds > 0, 'the tick interval is not beside the threshold')

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

test('the purity labels have a route of their own, admin-only', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        assert.equal((await request(app).get('/api/metals/purity_labels')).status, 401)
      })
      await asAdmin(TEST_ACTOR, async () => {
        const res = await request(app).get('/api/metals/purity_labels')
        assert.equal(res.status, 200, JSON.stringify(res.body))
        assert.ok(res.body.length > 0, 'metals.purity_labels has rows and the route returned none')
        for (const label of res.body) {
          assert.ok(label.metal_id, 'a purity label carries no metal')
          assert.ok(Number(label.purity) > 0, 'a purity label carries no purity')
        }
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the rate sheet pdf is admin-only like every other admin rate route', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        assert.equal((await request(app).get('/api/rates/sheet.pdf')).status, 401)
      })
      await asUser(TEST_ACTOR, async () => {
        assert.equal((await request(app).get('/api/rates/sheet.pdf')).status, 403)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})
