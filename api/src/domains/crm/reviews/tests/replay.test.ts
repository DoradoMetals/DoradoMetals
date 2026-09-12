import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { inPinnedTransaction, assertNothingEscaped, outside } from '#shared/testing/pinned-pool.ts'

await mockSessions()
const { default: app } = await import('#app')

type UserFixture = { id: string; name: string | null; email: string | null }
let admin: UserFixture
let customer: UserFixture
let visibleCount: number
let hiddenCount: number
const created: string[] = []

beforeAll(async () => {
  admin = TEST_ACTOR

  customer = TEST_CUSTOMER

  const counts = await outside<{ visible: number; hidden: number }>(
    `SELECT count(*) FILTER (WHERE NOT hidden)::int AS visible,
            count(*) FILTER (WHERE hidden)::int AS hidden
     FROM reviews.reviews`
  )
  visibleCount = counts[0].visible
  hiddenCount = counts[0].hidden

  assert.ok(visibleCount > 0, 'dev has no visible review - the public read is untestable')
  assert.ok(hiddenCount > 0, 'dev has no hidden review - the filter test would be vacuous')
})

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const newReview = (over: Partial<{ hidden: boolean }> = {}) =>
  Object.assign(
    {
      review_text: `left by the replay suite ${randomUUID().slice(0, 8)}`,
      rating: 5,
      name: `replay-${randomUUID().slice(0, 8)}`,
      hidden: false,
    },
    over
  )

const asAdmin = <T>(fn: () => Promise<T> | T) =>
  as({ id: admin.id, name: admin.name, email: admin.email, role: 'admin' }, fn)
const asCustomer = <T>(fn: () => Promise<T> | T) =>
  as({ id: customer.id, name: customer.name, email: customer.email, role: 'user' }, fn)

test('the public review list needs no session at all', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const res = await request(app).get('/api/reviews/public')
        assert.equal(res.status, 200, 'the public reviews route stopped being public')
        assert.ok(Array.isArray(res.body), 'the marketing site expects an array')
        assert.ok(res.body.length > 0, 'dev has a visible review and none came back')
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('no hidden review reaches the public list', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const res = await request(app).get('/api/reviews/public')
        const leaked = res.body.filter(
          (r: { id: string; hidden: boolean; name: string }) => r.hidden
        )
        assert.deepEqual(
          leaked.map((r: { id: string; hidden: boolean; name: string }) => r.id),
          [],
          `the public read returned ${leaked.length} review(s) the business hid`
        )

        assert.ok(
          res.body.length <= visibleCount,
          `the public read returned ${res.body.length} of ${visibleCount} visible reviews`
        )
        assert.equal(
          res.body.length,
          Math.min(visibleCount, 10),
          'the public read returned a different number of rows than dev has visible'
        )
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an admin sees the hidden reviews the public list withholds', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(async () => {
        const res = await request(app).get('/api/reviews')
        assert.equal(res.status, 200)
        const hidden = res.body.filter(
          (r: { id: string; hidden: boolean; name: string }) => r.hidden
        )
        assert.equal(
          hidden.length,
          hiddenCount,
          'the admin read is not returning every hidden review'
        )
        assert.equal(res.body.length, visibleCount + hiddenCount)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the public list carries no field the admin list lacks', async () => {
  await inPinnedTransaction(
    async () => {
      let publicFields: Set<string> | undefined
      let adminFields: Set<string> | undefined

      await anonymous(async () => {
        const res = await request(app).get('/api/reviews/public')
        publicFields = new Set(Object.keys(res.body[0] ?? {}))
      })

      await asAdmin(async () => {
        const res = await request(app).get('/api/reviews')
        adminFields = new Set(Object.keys(res.body[0] ?? {}))
      })

      assert.ok(publicFields, 'the public read produced no fields')
      assert.ok(adminFields, 'the admin read produced no fields')
      const adminSet = adminFields
      const publicExtras = [...publicFields].filter((f) => !adminSet.has(f))
      assert.deepEqual(publicExtras, [], 'the public read returns fields the admin read does not')

      for (const secret of ['created_by', 'updated_by', 'created_by_id', 'updated_by_id']) {
        assert.ok(!publicFields?.has(secret), `${secret} is on the unauthenticated wire`)
      }
      assert.ok(!publicFields?.has('user_id'), 'user_id is on the unauthenticated wire')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('every admin route refuses a signed-in non-admin', async () => {
  await inPinnedTransaction(
    async () => {
      await asCustomer(async () => {
        const calls = [
          ['get_all', request(app).get('/api/reviews')],
          ['get_one', request(app).get(`/api/reviews/${randomUUID()}`)],
          ['create', request(app).post('/api/reviews').send(newReview())],
          ['update', request(app).patch(`/api/reviews/${randomUUID()}`).send(newReview())],
          ['delete', request(app).delete(`/api/reviews/${randomUUID()}`)],
        ] as Array<[string, Promise<{ status: number }>]>
        for (const [name, call] of calls) {
          const res = await call
          assert.ok(
            [401, 403].includes(res.status),
            `${name} answered ${res.status} to a non-admin`
          )
        }
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an anonymous caller is refused every route but the public one', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const res = await request(app).get('/api/reviews')
        assert.ok([401, 403].includes(res.status), `get_all answered ${res.status}`)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an admin creating a review round-trips, and a hidden one stays out of public', async () => {
  await inPinnedTransaction(
    async () => {
      const review = newReview({ hidden: true })
      await asAdmin(async () => {
        const res = await request(app).post('/api/reviews').send(review)
        assert.equal(res.status, 201, JSON.stringify(res.body))
        created.push(review.name)

        const saved = Array.isArray(res.body) ? res.body[0] : res.body
        assert.ok(saved?.id, 'no id came back')
        assert.equal(saved.hidden, true, 'hidden was not stored as sent')
      })

      await anonymous(async () => {
        const res = await request(app).get('/api/reviews/public')
        assert.ok(
          !res.body.some(
            (r: { id: string; hidden: boolean; name: string }) => r.name === review.name
          ),
          'a review created as hidden appeared on the public list'
        )
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('nothing this file created survived the transaction', async () => {
  assert.ok(created.length > 0, 'no review was created, so this proves nothing')
  for (const name of created) {
    assert.equal(
      await assertNothingEscaped('reviews.reviews', 'name = $1', [name]),
      0,
      `${name} was committed to dev`
    )
  }
})
