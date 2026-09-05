import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, anonymous } from '#shared/testing/session.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { inPinnedTransaction, outside } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import * as usersRepo from '#db/users/repo.ts'

const inPinned = <T>(fn: (c: import('pg').PoolClient) => Promise<T> | T): Promise<T> =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.USERS })

await mockSessions()
const { default: app } = await import('#app')

type UserFixture = { id: string; name: string | null; email: string | null }
type CustomerFixture = UserFixture & { dorado_funds: number | null }

let admin: UserFixture
let customer: CustomerFixture
let balanceBefore: number | null

const sameMoney = (actual: unknown, expected: unknown, message: string) =>
  assert.equal(
    Number(actual).toFixed(6),
    Number(expected).toFixed(6),
    `${message} (got ${actual}, wanted ${expected})`
  )

const funds = async (id: string): Promise<number | null> => {
  const rows = await outside<{ dorado_funds: number | null }>(
    `WITH lock AS (SELECT pg_advisory_xact_lock($2))
     SELECT dorado_funds FROM auth.users WHERE id = $1`,
    [id, LOCKS.USERS]
  )
  return rows[0]?.dorado_funds ?? null
}

const STARTING_BALANCE = 250

beforeAll(async () => {
  admin = TEST_ACTOR
  customer = { ...TEST_CUSTOMER, dorado_funds: STARTING_BALANCE }
  balanceBefore = await funds(customer.id)
})

const fund = async (client: import('pg').PoolClient) => {
  await usersRepo.adjustCredit(customer.id, 'edit', STARTING_BALANCE, client)
}

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('every route refuses an anonymous caller', async () => {
  await inPinned(async () => {
    await anonymous(async () => {
      const calls = [
        ['get_user', request(app).get(`/api/users/${customer.id}`)],
        ['`GET /api/users`', request(app).get('/api/users')],
        ['`GET /api/users/admins`', request(app).get('/api/users/admins')],
        [
          'POST /api/users/:id/credit',
          request(app).post(`/api/users/${customer.id}/credit`).send({ op: 'add', amount: 1 }),
        ],
      ]
      for (const [name, call] of calls as Array<[string, Promise<{ status: number }>]>) {
        const res = await call
        assert.ok([401, 403].includes(res.status), `${name} answered ${res.status} anonymously`)
      }
    })
  })
})

test('a signed-in customer cannot top up their own balance', async () => {
  await inPinned(async () => {
    await as({ ...customer, role: 'user' }, async () => {
      const res = await request(app)
        .post(`/api/users/${customer.id}/credit`)
        .send({ op: 'add', amount: 1000 })
      assert.ok([401, 403].includes(res.status), `a customer got ${res.status} adjusting credit`)
    })
  })
})

test('an admin reads the user list with balances', async () => {
  await inPinned(async () => {
    await as({ ...admin, role: 'admin' }, async () => {
      const res = await request(app).get('/api/users')
      assert.equal(res.status, 200)
      assert.ok(res.body.length > 0, 'dev has users and none came back')
      assert.ok('dorado_funds' in res.body[0], 'the admin list lost the balance column')
    })
  })
})

test('the single-user read carries the balance, like the list', async () => {
  await inPinned(async () => {
    await as({ ...admin, role: 'admin' }, async () => {
      const res = await request(app).get(`/api/users/${customer.id}`)
      assert.equal(res.status, 200)
      assert.equal(res.body.id, customer.id)
      assert.ok('dorado_funds' in res.body, 'get_user stopped returning the balance')

      const list = await request(app).get('/api/users')
      const fromList = list.body.find((u: { id: string }) => u.id === customer.id)
      assert.equal(
        Number(res.body.dorado_funds),
        Number(fromList.dorado_funds),
        "the two reads disagree about one customer's balance"
      )
    })
  })
})

test('the admin list is only admins, and the full list is more than that', async () => {
  await inPinned(async () => {
    await as({ ...admin, role: 'admin' }, async () => {
      const admins = await request(app).get('/api/users/admins')
      assert.equal(admins.status, 200)
      assert.ok(admins.body.length > 0, 'no admin came back from GET /api/users/admins')
      assert.deepEqual(
        admins.body.filter((u: { id: string; role: string }) => u.role !== 'admin'),
        [],
        'GET /api/users/admins returned a non-admin'
      )

      const all = await request(app).get('/api/users')
      assert.ok(
        all.body.length > admins.body.length,
        'every user is an admin, so this comparison proves nothing'
      )
    })
  })
})

test('the three operations each move the balance the way they say', async () => {
  await inPinned(async (client) => {
    await fund(client)
    await as({ ...admin, role: 'admin' }, async () => {
      const read = async () => {
        const res = await request(app).get('/api/users')
        const row = res.body.find(
          (u: { id: string; dorado_funds: unknown }) => u.id === customer.id
        )
        assert.ok(row, `customer ${customer.id} is absent from GET /api/users`)
        return Number(row.dorado_funds)
      }

      const start = await read()

      let res = await request(app)
        .post(`/api/users/${customer.id}/credit`)
        .send({ op: 'add', amount: 25 })
      assert.equal(res.status, 200, JSON.stringify(res.body))
      sameMoney(await read(), start + 25, 'add did not add')

      res = await request(app)
        .post(`/api/users/${customer.id}/credit`)
        .send({ op: 'subtract', amount: 10 })
      assert.equal(res.status, 200, JSON.stringify(res.body))
      sameMoney(await read(), start + 15, 'subtract did not subtract')

      res = await request(app)
        .post(`/api/users/${customer.id}/credit`)
        .send({ op: 'edit', amount: 7.5 })
      assert.equal(res.status, 200, JSON.stringify(res.body))
      sameMoney(await read(), 7.5, 'edit did not set the balance outright')
    })
  })
})

test('an unrecognised operation is refused and the balance is untouched', async () => {
  await inPinned(async (client) => {
    await fund(client)
    await as({ ...admin, role: 'admin' }, async () => {
      const read = async () => {
        const res = await request(app).get('/api/users')
        const row = res.body.find(
          (u: { id: string; dorado_funds: unknown }) => u.id === customer.id
        )
        assert.ok(row, `customer ${customer.id} is absent from GET /api/users`)
        return row.dorado_funds
      }
      const start = await read()

      for (const op of ['ADD', 'Add', 'increment', '', null, undefined, 'delete']) {
        const res = await request(app)
          .post(`/api/users/${customer.id}/credit`)
          .send({ op, amount: 50 })
        assert.equal(res.status, 400, `op ${JSON.stringify(op)} answered ${res.status}, not 400`)
        sameMoney(
          await read(),
          start,
          `op ${JSON.stringify(op)} changed the balance before being refused`
        )
      }

      const retired = await request(app)
        .post(`/api/users/${customer.id}/credit`)
        .send({ mode: 'add', amount: 50 })
      assert.equal(retired.status, 400, 'the retired `mode` spelling was honoured')
      sameMoney(await read(), start, '`mode` moved the balance')
    })
  })
})

test('an amount that is not a number is refused rather than treated as zero', async () => {
  await inPinned(async () => {
    await as({ ...admin, role: 'admin' }, async () => {
      for (const amount of ['', null, undefined, 'abc', {}, [], NaN, '  ']) {
        const res = await request(app)
          .post(`/api/users/${customer.id}/credit`)
          .send({ op: 'edit', amount })
        assert.equal(
          res.status,
          400,
          `amount ${JSON.stringify(amount)} answered ${res.status}, not 400`
        )
      }
    })
  })
})

test('no balance this file moved survived the transaction', async () => {
  assert.equal(
    String(await funds(customer.id)),
    String(balanceBefore),
    'a credit adjustment was committed to dev'
  )
})
