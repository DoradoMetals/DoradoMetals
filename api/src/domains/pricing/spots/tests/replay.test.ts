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
import { aUser, anOrder } from '#shared/testing/builders/index.ts'

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
        assert.ok(Array.isArray(res.body.spots), 'the pricing page expects a list of cards')
        assert.ok(Array.isArray(res.body.paused), 'the board carries no paused list')
        assert.equal(
          res.body.spots.length,
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
        assert.ok(res.body.spots.length > 0, 'the spot feed came back empty')
        for (const spot of res.body.spots) {
          for (const field of ['id', 'ask', 'bid', 'last_ask', 'last_bid', 'last_tick_at']) {
            assert.ok(field in spot, `a spot is missing ${field}`)
          }
          assert.ok(
            Number.isFinite(Number(spot.last_ask)),
            `${spot.id} has a non-numeric ask (${spot.last_ask}) - every quote built on it is wrong`
          )
          assert.ok(
            Number(spot.last_ask) > 0,
            `${spot.id} has an ask of ${spot.last_ask}; a zero ask values metal at nothing`
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
          const served = res.body.spots.find((s: { id: string }) => s.id === row.metal_id)
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
          'last_tick_at',
          'last_ask',
          'last_bid',
          'state',
        ])
        const unexpected = Object.keys(res.body.spots[0] ?? {}).filter((k) => !allowed.has(k))
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
        assert.ok(res.body.spots.length > 0, 'the spot feed came back empty')
        for (const spot of res.body.spots) {
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

test('every metal carries a state of live, stale or frozen, and its last tick', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const res = await request(app).get('/api/spots')
        assert.ok(res.body.spots.length > 0, 'the spot feed came back empty')
        for (const spot of res.body.spots) {
          assert.ok(
            ['live', 'stale', 'frozen'].includes(spot.state),
            `${spot.id} carries an unexpected state: ${spot.state}`
          )
          assert.ok(spot.last_tick_at, `${spot.id} carries no last_tick_at`)
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
    ['get', '/api/spots/metals/Gold'],
    ['get', '/api/spots/metals/Gold/activity'],
    ['patch', '/api/spots/metals/Gold/source'],
    ['patch', '/api/spots/adjustments/Gold/nfusion'],
    ['delete', '/api/spots/adjustments/Gold/nfusion'],
    ['delete', '/api/spots/adjustments/Gold'],
    ['post', '/api/spots/freeze'],
    ['post', '/api/spots/locks/00000000-0000-4000-8000-000000000000/unlock'],
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

test('an admin sets an adjustment, reads it back in adjust mode, logs it and clears it', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(TEST_ACTOR, async () => {
        const set = await request(app)
          .patch(`/api/spots/adjustments/Silver/${SOURCE_ID}`)
          .send({ bid_amount: -0.2, ask_amount: 0.2, reason: 'admin test adjustment' })
        assert.equal(set.status, 200, JSON.stringify(set.body))
        assert.equal(set.body.metal_id, 'Silver')
        assert.equal(set.body.scope, 'Active')

        const silver = await request(app).get('/api/spots/metals/Silver')
        assert.equal(silver.status, 200)
        assert.equal(silver.body.mode, 'adjust')
        assert.equal(silver.body.adjustment.reason, 'admin test adjustment')

        const log = await request(app).get('/api/spots/adjustments/history?metal_id=Silver')
        assert.equal(log.status, 200)
        assert.ok(log.body.length > 0, 'the adjustment left no history row')
        assert.equal(log.body[0].actor_id, TEST_ACTOR.id)
        assert.equal('actor_name' in log.body[0], false)

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
  vi.mocked(fetchQuotes).mockResolvedValueOnce([
    { metal_id: 'Gold', ask: 2345.67, bid: 2344.56, dollar_change: 1, percent_change: 0.1 },
  ])

  await inPinnedTransaction(
    async () => {
      await asAdmin(TEST_ACTOR, async () => {
        const res = await request(app).post('/api/spots/refresh')
        assert.equal(res.status, 200, JSON.stringify(res.body))
        const gold = res.body.spots.find((s: { id: string }) => s.id === 'Gold')
        assert.equal(Number(gold.last_bid).toFixed(2), '2344.56')
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

test('an admin reads a metal, points it at a source, back to the default, and reads its activity', async () => {
  await inPinnedTransaction(
    async (c) => {
      await c.query(
        `INSERT INTO spots.sources (id, enabled, sort_order) VALUES ('zz-http-feed', true, 909)`
      )
      await c.query(
        `INSERT INTO spots.current (source_id, metal_id, bid, ask, at, seen_at)
         VALUES ('zz-http-feed', 'Gold', 1, 2, now(), now())`
      )
      await asAdmin(TEST_ACTOR, async () => {
        const metal = await request(app).get('/api/spots/metals/Gold')
        assert.equal(metal.status, 200, JSON.stringify(metal.body))
        assert.ok(['live', 'stale', 'frozen'].includes(metal.body.state))
        assert.ok('last_tick_at' in metal.body)

        const moved = await request(app)
          .patch('/api/spots/metals/Gold/source')
          .send({ source_id: 'zz-http-feed' })
        assert.equal(moved.status, 200, JSON.stringify(moved.body))
        assert.equal(moved.body.source_id, 'zz-http-feed')
        assert.equal(moved.body.follows_default, false)

        const back = await request(app)
          .patch('/api/spots/metals/Gold/source')
          .send({ source_id: null })
        assert.equal(back.status, 200)
        assert.equal(back.body.follows_default, true)

        const bad = await request(app).patch('/api/spots/metals/Gold/source').send({})
        assert.equal(bad.status, 400, 'a missing source_id was accepted')

        const activity = await request(app).get('/api/spots/metals/Gold/activity?days=7')
        assert.equal(activity.status, 200)
        assert.ok(
          activity.body.some((a: { kind: string; field: string }) => a.field === 'active_source'),
          'the source switch is missing from the activity'
        )
        const tooLong = await request(app).get('/api/spots/metals/Gold/activity?days=0')
        assert.equal(tooLong.status, 400)

        assert.equal((await request(app).get('/api/spots/metals/Unobtainium')).status, 404)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an admin freezes everything, sees it on the board, and cancels one metal', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(TEST_ACTOR, async () => {
        const blank = await request(app).post('/api/spots/freeze').send({ reason: '' })
        assert.equal(blank.status, 422)

        const frozen = await request(app).post('/api/spots/freeze').send({ reason: 'feed down' })
        assert.equal(frozen.status, 200, JSON.stringify(frozen.body))
        assert.ok(frozen.body.spots.every((s: { state: string }) => s.state === 'frozen'))

        const cancelled = await request(app).delete('/api/spots/adjustments/Gold')
        assert.equal(cancelled.status, 204)
        const again = await request(app).delete('/api/spots/adjustments/Gold')
        assert.equal(again.status, 404)

        const gold = await request(app).get('/api/spots/metals/Gold')
        assert.notEqual(gold.body.state, 'frozen')
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an admin pages the locks with filters and unlocks one', async () => {
  await inPinnedTransaction(
    async (c) => {
      const order = await anOrder(c, await aUser(c), { direction: 'purchase' })
        .withLines({ bullion_id: null, metal_id: 'Gold', content: 1, premium: 1, quantity: 1 })
        .withSpots({ bid: 2000, ask: 2010 })
      await c.query('UPDATE orders.orders SET spots_locked = true WHERE id = $1', [order.id])
      await c.query(
        `INSERT INTO orders.spot_locks (order_id, metal_id, action, bid, ask)
         SELECT os.order_id, os.metal_id, 'lock', os.bid, os.ask
           FROM orders.spots os WHERE os.order_id = $1`,
        [order.id]
      )
      await asAdmin(TEST_ACTOR, async () => {
        const page = await request(app).get(
          `/api/spots/locks?metal=Gold&status=active&q=PO-${order.number}&page=1`
        )
        assert.equal(page.status, 200, JSON.stringify(page.body))
        assert.equal(page.body.page_size, 8)
        const lock = page.body.items.find((l: { order_id: string }) => l.order_id === order.id)
        assert.ok(lock, 'the filtered page missed the order')
        assert.equal(lock.status, 'active')

        const unlocked = await request(app).post(`/api/spots/locks/${lock.id}/unlock`)
        assert.equal(unlocked.status, 200, JSON.stringify(unlocked.body))
        assert.equal(unlocked.body.status, 'released')

        const twice = await request(app).post(`/api/spots/locks/${lock.id}/unlock`)
        assert.equal(twice.status, 409)

        const badStatus = await request(app).get('/api/spots/locks?status=expired')
        assert.equal(badStatus.status, 400)
        const badId = await request(app).post('/api/spots/locks/not-a-uuid/unlock')
        assert.equal(badId.status, 400)
      })
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('an admin makes another source the default in one PATCH', async () => {
  await inPinnedTransaction(
    async (c) => {
      await c.query(
        `INSERT INTO spots.sources (id, enabled, sort_order) VALUES ('zz-http-default', true, 910)`
      )
      await asAdmin(TEST_ACTOR, async () => {
        const made = await request(app)
          .patch('/api/spots/sources/zz-http-default')
          .send({ is_default: true })
        assert.equal(made.status, 200, JSON.stringify(made.body))
        assert.equal(made.body.is_default, true)
        const list = await request(app).get('/api/spots/sources')
        assert.deepEqual(
          list.body
            .filter((s: { is_default: boolean }) => s.is_default)
            .map((s: { id: string }) => s.id),
          ['zz-http-default']
        )
        const refused = await request(app)
          .patch('/api/spots/sources/zz-http-default')
          .send({ is_default: false })
        assert.equal(refused.status, 422)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test("anyone reads a metal's candles by range; a bad range or metal is refused", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get('/api/spots/metals/Gold/candles?range=1Y')
      assert.equal(res.status, 200, JSON.stringify(res.body))
      assert.ok(Array.isArray(res.body))
      for (const candle of res.body) {
        assert.deepEqual(Object.keys(candle).sort(), [
          'bucket_start',
          'close',
          'high',
          'low',
          'open',
          'ticks',
        ])
      }
      const named = await request(app).get('/api/spots/metals/Gold/candles?range=1W&source=nfusion')
      assert.equal(named.status, 200)
      assert.equal((await request(app).get('/api/spots/metals/Gold/candles?range=5Y')).status, 400)
      assert.equal(
        (await request(app).get('/api/spots/metals/Gold/candles?range=1D&extra=1')).status,
        400
      )
      assert.equal((await request(app).get('/api/spots/metals/Unobtainium/candles')).status, 404)
    })
  })
})

test('the stream answers an event stream whose first event is the board', async () => {
  await anonymous(async () => {
    let text = ''
    const res = await request(app)
      .get('/api/spots/stream')
      .buffer(false)
      .parse((stream, done) => {
        stream.on('data', (chunk: Buffer) => {
          text += chunk.toString()
          if (text.includes('\n\n')) {
            stream.destroy()
            done(null, text)
          }
        })
      })
    assert.equal(res.status, 200)
    assert.match(String(res.headers['content-type']), /^text\/event-stream/)
    assert.equal(res.headers['cache-control'], 'no-cache')
    assert.equal(res.headers['content-encoding'], undefined)
    const [first] = text.split('\n\n')
    const lines = first.split('\n')
    assert.equal(lines[0], 'event: board')
    const board = JSON.parse(lines[1].replace(/^data: /, ''))
    assert.ok(Array.isArray(board.spots) && board.spots.length > 0)
    assert.ok(Array.isArray(board.paused))
  })
})
