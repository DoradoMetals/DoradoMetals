import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { inPinnedTransaction, outside } from '#shared/testing/pinned-pool.ts'

await mockSessions()
const { default: app } = await import('#app')

type UserFixture = { id: string; name: string | null; email: string | null }

let admin: UserFixture
let customer: UserFixture
let rateCountBefore: number

beforeAll(async () => {
  admin = TEST_ACTOR

  customer = TEST_CUSTOMER

  const rates = await outside(`SELECT count(*)::int AS n FROM rates.rates`)
  assert.ok(rates[0].n > 0, 'dev has no rates to read')
  rateCountBefore = rates[0].n
})

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const asAdmin = <T>(fn: () => Promise<T> | T) =>
  as({ id: admin.id, name: admin.name, email: admin.email, role: 'admin' }, fn)
const asCustomer = <T>(fn: () => Promise<T> | T) =>
  as({ id: customer.id, name: customer.name, email: customer.email, role: 'user' }, fn)

test('the public rate list needs no session and carries pay per unit', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const res = await request(app).get('/api/rates')
        assert.equal(res.status, 200, 'the public rates route stopped being public')
        assert.ok(
          Array.isArray(res.body) && res.body.length > 0,
          'dev has rates and none came back'
        )
        const band = res.body[0]
        assert.equal(band.display_unit, 'troy_oz', 'the default display unit is not the troy ounce')
        assert.equal(typeof band.scrap_pay, 'number', 'no pay figure came back')
        assert.ok(!('created_by' in band), 'the public list carries an audit column')

        const grams = await request(app).get('/api/rates?unit=g')
        assert.equal(grams.status, 200)
        const same = grams.body.find((b: { id: string }) => b.id === band.id)
        assert.equal(
          (same.scrap_pay * 31.1034768).toFixed(6),
          Number(band.scrap_pay).toFixed(6),
          'a gram does not pay a troy ounce over 31.1034768'
        )

        const unknown = await request(app).get('/api/rates?unit=furlong')
        assert.equal(unknown.status, 422, 'an unknown unit was answered')
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('every writing route refuses a signed-in non-admin', async () => {
  await inPinnedTransaction(
    async () => {
      await asCustomer(async () => {
        const calls = [
          ['admin', request(app).get('/api/rates/admin')],
          ['one', request(app).get(`/api/rates/${randomUUID()}`)],
          ['changes', request(app).get('/api/rates/changes')],
          ['replace', request(app).patch('/api/rates/Gold').send({ bands: [] })],
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

test('an anonymous caller is refused the admin read and the change log', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        for (const path of ['/api/rates/admin', '/api/rates/changes']) {
          const res = await request(app).get(path)
          assert.ok([401, 403].includes(res.status), `${path} answered ${res.status}`)
        }
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the refused writes wrote nothing', async () => {
  const after = await outside(`SELECT count(*)::int AS n FROM rates.rates`)
  assert.equal(after[0].n, rateCountBefore, 'a route that answered 401/403 still changed the table')
})

test('replacing the bands of a metal answers its pay and leaves a change an admin reads back', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(async () => {
        const res = await request(app)
          .patch('/api/rates/Gold')
          .send({
            bands: [
              { min_qty: 0, max_qty: 7, scrap_pct: 0.81, bullion_pct: 0.83 },
              { min_qty: 7, max_qty: null, scrap_pct: 0.88, bullion_pct: 0.9 },
            ],
          })
        assert.equal(res.status, 200, JSON.stringify(res.body))
        assert.deepEqual(
          res.body.map((b: { min_qty: number; max_qty: number | null }) => [b.min_qty, b.max_qty]),
          [
            [0, 7],
            [7, null],
          ]
        )
        assert.ok(res.body.every((b: { metal_id: string }) => b.metal_id === 'Gold'))

        const changes = await request(app).get('/api/rates/changes?q=Gold')
        assert.equal(changes.status, 200)
        const more = await request(app).get('/api/rates/changes?q=Gold&page=2')
        const entry = [...changes.body.items, ...more.body.items].find(
          (h: { field: string; new_value: string }) =>
            h.field === 'scrap_pct' && Number(h.new_value) === 0.81
        )
        assert.ok(entry, 'the band change did not appear in the change log')
        assert.equal(entry.type, 'scrap')
        assert.equal(entry.metal_id, 'Gold')
        assert.equal(entry.min_qty, 0)
        assert.ok(entry.actor_id, 'the change carries no actor id')
        assert.equal('actor_name' in entry, false)

        const gap = await request(app)
          .patch('/api/rates/Gold')
          .send({
            bands: [
              { min_qty: 0, max_qty: 5, scrap_pct: 0.8, bullion_pct: 0.8 },
              { min_qty: 6, max_qty: null, scrap_pct: 0.8, bullion_pct: 0.8 },
            ],
          })
        assert.equal(gap.status, 422, 'a gap between bands was accepted')

        const noMetal = await request(app)
          .patch('/api/rates/Unobtainium')
          .send({ bands: [{ min_qty: 0, max_qty: null, scrap_pct: 0.8, bullion_pct: 0.8 }] })
        assert.equal(noMetal.status, 404)

        const extra = await request(app)
          .patch('/api/rates/Gold')
          .send({ bands: [{ min_qty: 0, max_qty: null, scrap_pct: 1, bullion_pct: 1, unit: 'g' }] })
        assert.equal(extra.status, 400, 'a band with a stray key was accepted')
      })
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.RATES }
  )
})

test('the tier table is public, labelled and banded', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const res = await request(app).get('/api/rates/tiers')
        assert.equal(res.status, 200, 'the rates page read stopped being public')
        assert.ok(
          Array.isArray(res.body) && res.body.length > 0,
          'dev has rates and none came back'
        )
        const [tier] = res.body
        assert.equal(typeof tier.metal_id, 'string')
        assert.ok(Array.isArray(tier.bands) && tier.bands.length > 0)
        assert.ok(tier.bands[0].label, 'a band came back with no label to print')
        assert.ok(tier.bands[0].key, 'a band came back with no column key')
        assert.equal(typeof tier.top_pct, 'number', "the landing strip has no 'up to' number")
      })
    },
    { actor: TEST_ACTOR.id }
  )
})
